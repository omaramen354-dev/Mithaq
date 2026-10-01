import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, contracts } from "@/db/schema";
import { desc, ilike, or, sql, eq, and } from "drizzle-orm";
import { findPlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/users — إدارة المستخدمين (للمشرفين فقط)
   GET  : قائمة المستخدمين مع بحث (اسم/بريد) وفلترة بالباقة
          + عدد عقود كل مستخدم
   POST : إجراءات المشرف:
          - set_plan   : تغيير الباقة (ترقية/تخفيض) مع مدة الصلاحية
          - toggle_admin: ترقية مستخدم إلى مشرف أو إزالة الترقية
          - clear_plan : إعادة الحساب إلى المجاني (free)
   القاعدة: session.user.isAdmin هو بوابة الحماية الوحيدة هنا.
   ============================================================ */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.dbId || !session.user.isAdmin) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const plan = (req.nextUrl.searchParams.get("plan") || "").trim();

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

  return NextResponse.json({
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
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  const userId = (body.userId || "").trim();
  if (!userId) {
    return NextResponse.json({ ok: false, message: "معرّف المستخدم مفقود." }, { status: 422 });
  }

  const targetRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const target = targetRows[0];
  if (!target) {
    return NextResponse.json({ ok: false, message: "المستخدم غير موجود." }, { status: 404 });
  }

  /* حماية: المشرف لا يعدّل صلاحياته نفسه (يمنع قفل اللوحة بالخطأ) */
  if (body.action === "toggle_admin" && target.id === session.user.dbId) {
    return NextResponse.json(
      { ok: false, message: "لا يمكنك تعديل صلاحيتك كمشرف من هنا." },
      { status: 409 }
    );
  }

  if (body.action === "toggle_admin") {
    const next = !target.isAdmin;
    await db.update(users).set({ isAdmin: next }).where(eq(users.id, userId));
    return NextResponse.json({
      ok: true,
      message: next ? `تمت ترقية ${target.name} إلى مشرف.` : `أُزيلت صلاحية المشرف من ${target.name}.`,
    });
  }

  if (body.action === "clear_plan") {
    await db
      .update(users)
      .set({ plan: "free", planExpiresAt: null })
      .where(eq(users.id, userId));
    return NextResponse.json({ ok: true, message: `أُعيد ${target.name} إلى الباقة المجانية.` });
  }

  if (body.action === "set_plan") {
    const plan = findPlan((body.plan || "").trim());
    if (!plan || plan.id === "free" || plan.service) {
      return NextResponse.json(
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

    return NextResponse.json({
      ok: true,
      message: `تم تفعيل باقة ${plan.title} لـ ${target.name}.`,
    });
  }

  return NextResponse.json({ ok: false, message: "إجراء غير معروف." }, { status: 422 });
}
