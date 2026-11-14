import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { users, contracts } from "@/db/schema";
import { desc, ilike, or, sql, eq, and } from "drizzle-orm";
import { findPlan } from "@/lib/plans";
import { logEvent } from "@/lib/logger";
import { readBoundedJson } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/users — إدارة المستخدمين (للمشرفين فقط)
   ============================================================ */

const requireAdmin = requireAdminSession;

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  const plan = (req.nextUrl.searchParams.get("plan") || "").trim().slice(0, 40);

  const filters = [];
  if (q) {
    filters.push(
      or(
        ilike(users.name, `%${q}%`),
        ilike(users.email, `%${q}%`)
      )
    );
  }
  if (plan === "paid") {
    filters.push(sql`${users.plan} <> 'free'`);
  } else if (plan === "free") {
    filters.push(eq(users.plan, "free"));
  } else if (plan) {
    filters.push(eq(users.plan, plan));
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      picture: users.picture,
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      paidOnce: users.paidOnce,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      contractsCount: sql<number>`(
        select count(*)::int from ${contracts} where ${contracts.ownerId} = ${users.id}
      )`,
    })
    .from(users)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);

  return noStoreJson({
    ok: true,
    users: rows.map((u) => ({
      ...u,
      planExpiresAt: u.planExpiresAt?.toISOString() || null,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt.toISOString(),
    })),
  });
}

type Body = {
  action?: "set_plan" | "clear_plan" | "toggle_admin";
  userId?: string;
  plan?: string;
};

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const parsed = await readBoundedJson<Body>(req, 16_384);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const body = parsed.data;

  const userId = String(body.userId || "").trim();
  if (!isUuid(userId)) {
    return noStoreJson({ ok: false, message: "معرّف المستخدم غير صالح." }, { status: 422 });
  }

  const targetRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const target = targetRows[0];
  if (!target) {
    return noStoreJson({ ok: false, message: "المستخدم غير موجود." }, { status: 404 });
  }

  if (body.action === "toggle_admin" && target.id === session.user.dbId) {
    return noStoreJson(
      { ok: false, message: "لا يمكنك تعديل صلاحيتك كمشرف من هنا." },
      { status: 409 }
    );
  }

  const actor = {
    actorId: session.user.dbId!,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
  };

  if (body.action === "toggle_admin") {
    const next = !target.isAdmin;
    await db.update(users).set({ isAdmin: next }).where(eq(users.id, userId));
    await logEvent({
      action: next ? "admin_granted" : "admin_revoked",
      entity: "user",
      entityId: target.id,
      ...actor,
      detail: next
        ? `ترقية ${target.name} (${target.email}) إلى مشرف`
        : `إزالة صلاحية المشرف من ${target.name} (${target.email})`,
      meta: { targetEmail: target.email },
    });
    return noStoreJson({
      ok: true,
      message: next ? `تمت ترقية ${target.name} إلى مشرف.` : `أُزيلت صلاحية المشرف من ${target.name}.`,
    });
  }

  if (body.action === "clear_plan") {
    await db
      .update(users)
      .set({ plan: "free", planExpiresAt: null, paidOnce: false, isSingleUsed: false })
      .where(eq(users.id, userId));
    await logEvent({
      action: "plan_changed",
      entity: "user",
      entityId: target.id,
      ...actor,
      detail: `إعادة ${target.name} إلى الباقة المجانية يدوياً`,
      meta: { from: target.plan, to: "free" },
    });
    return noStoreJson({ ok: true, message: `أُعيد ${target.name} إلى الباقة المجانية.` });
  }

  if (body.action === "set_plan") {
    const plan = findPlan(String(body.plan || "").trim());
    if (!plan || plan.id === "free" || plan.service) {
      return noStoreJson(
        { ok: false, message: "اختر باقة صالحة (غير المجانية وغير الخدمات)." },
        { status: 422 }
      );
    }
    const now = new Date();
    const expires = plan.unit === "month" ? new Date(now.getTime() + 30 * 864e5) : null;
    const isOnce = plan.unit === "once";

    await db
      .update(users)
      .set({
        plan: plan.id,
        planExpiresAt: expires,
        paidOnce: isOnce ? true : undefined,
        isSingleUsed: plan.id === "single" ? false : undefined,
      })
      .where(eq(users.id, userId));

    await logEvent({
      action: "plan_changed",
      entity: "user",
      entityId: target.id,
      ...actor,
      detail: `تغيير باقة ${target.name} من ${target.plan} إلى ${plan.id} يدوياً`,
      meta: { from: target.plan, to: plan.id, expires: expires?.toISOString() || null },
    });

    return noStoreJson({
      ok: true,
      message: `تم تفعيل باقة ${plan.title} لـ ${target.name}.`,
    });
  }

  return noStoreJson({ ok: false, message: "إجراء غير معروف." }, { status: 422 });
}
