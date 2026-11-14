import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { users, contracts, transactions } from "@/db/schema";
import { desc, ilike, or, sql, eq, and, inArray, isNull } from "drizzle-orm";
import { findPlan } from "@/lib/plans";
import { logEvent } from "@/lib/logger";
import { readBoundedJson } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/users — إدارة المستخدمين (للمشرفين فقط)
   يعرض لكل مستخدم عدد العقود الفعلي (المنشأة + المشاركة كطرف ثانٍ)،
   واستهلاك الشهر الحالي، وحالة التجميد المالي، وعدد العقود غير المرتبطة.
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
      googleId: users.googleId,
      name: users.name,
      email: users.email,
      picture: users.picture,
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      paidOnce: users.paidOnce,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);

  const userIds = rows.map((u) => u.id);
  const userEmails = rows.map((u) => u.email.toLowerCase()).filter(Boolean);
  const userGoogleIds = rows.map((u) => u.googleId).filter(Boolean);

  const contractFilterParts = [];
  if (userIds.length) contractFilterParts.push(inArray(contracts.ownerId, userIds));
  if (userGoogleIds.length) contractFilterParts.push(inArray(contracts.party2GoogleId, userGoogleIds));
  if (userEmails.length) {
    contractFilterParts.push(inArray(sql`lower(${contracts.party2Email})`, userEmails));
  }

  const [relatedContracts, suspendedRows, orphanRows] = await Promise.all([
    contractFilterParts.length
      ? db
          .select({
            id: contracts.id,
            ownerId: contracts.ownerId,
            party2Email: contracts.party2Email,
            party2GoogleId: contracts.party2GoogleId,
            createdAt: contracts.createdAt,
          })
          .from(contracts)
          .where(or(...contractFilterParts))
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({ userId: transactions.userId })
          .from(transactions)
          .where(
            and(
              inArray(transactions.userId, userIds),
              eq(transactions.status, "suspended")
            )
          )
      : Promise.resolve([]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contracts)
      .where(isNull(contracts.ownerId)),
  ]);

  const suspendedSet = new Set(suspendedRows.map((r) => r.userId));
  const now = new Date();
  const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const ownedMap = new Map<string, number>();
  const monthMap = new Map<string, number>();
  const participatedMap = new Map<string, number>();

  const emailToUserId = new Map<string, string>();
  const googleToUserId = new Map<string, string>();
  for (const u of rows) {
    emailToUserId.set(u.email.toLowerCase(), u.id);
    if (u.googleId) googleToUserId.set(u.googleId, u.id);
  }

  for (const c of relatedContracts) {
    if (c.ownerId) {
      ownedMap.set(c.ownerId, (ownedMap.get(c.ownerId) || 0) + 1);
      if (c.createdAt && c.createdAt.getTime() >= monthStartMs) {
        monthMap.set(c.ownerId, (monthMap.get(c.ownerId) || 0) + 1);
      }
    }
    const p2Id =
      (c.party2GoogleId && googleToUserId.get(c.party2GoogleId)) ||
      (c.party2Email && emailToUserId.get(c.party2Email.toLowerCase())) ||
      null;
    if (p2Id && p2Id !== c.ownerId) {
      participatedMap.set(p2Id, (participatedMap.get(p2Id) || 0) + 1);
    }
  }

  return noStoreJson({
    ok: true,
    orphanContractsCount: orphanRows[0]?.n || 0,
    users: rows.map((u) => {
      const ownedContractsCount = ownedMap.get(u.id) || 0;
      const participatedContractsCount = participatedMap.get(u.id) || 0;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        picture: u.picture,
        plan: u.plan,
        planExpiresAt: u.planExpiresAt?.toISOString() || null,
        paidOnce: u.paidOnce,
        isAdmin: u.isAdmin,
        isSuspended: suspendedSet.has(u.id),
        createdAt: u.createdAt.toISOString(),
        lastSeenAt: u.lastSeenAt.toISOString(),
        ownedContractsCount,
        participatedContractsCount,
        thisMonthCount: monthMap.get(u.id) || 0,
        contractsCount: ownedContractsCount + participatedContractsCount,
      };
    }),
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
