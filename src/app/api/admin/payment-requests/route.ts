import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentRequests, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { findPlan, MONTH_DAYS } from "@/lib/plans";

export const runtime = "nodejs";

/* ============================================================
   /api/admin/payment-requests — إدارة طلبات الدفع (للمشرفين)
   GET: قائمة الطلبات (الأحدث أولاً)
   POST: قرار المشرف — paid (تأكيد + تفعيل الباقة) | rejected
   القاعدة الذهبية: التفعيل يحدث فقط من تأكيد المشرف هنا —
   لا يوجد أي مسار يفعّل الباقة مباشرة من الواجهة العامة.
   ============================================================ */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.dbId || !session.user.isAdmin) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(paymentRequests)
    .orderBy(desc(paymentRequests.createdAt))
    .limit(50);
  return NextResponse.json({ ok: true, requests: rows });
}

type Body = { id?: string; action?: "paid" | "rejected"; note?: string };

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

  const id = (body.id || "").trim();
  if (!id || (body.action !== "paid" && body.action !== "rejected")) {
    return NextResponse.json({ ok: false, message: "بيانات القرار ناقصة." }, { status: 422 });
  }

  const rows = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.id, id))
    .limit(1);
  const reqRow = rows[0];
  if (!reqRow) {
    return NextResponse.json({ ok: false, message: "الطلب غير موجود." }, { status: 404 });
  }
  if (reqRow.status === "paid" || reqRow.status === "rejected") {
    return NextResponse.json(
      { ok: false, message: "هذا الطلب عولج سابقاً." },
      { status: 409 }
    );
  }

  if (body.action === "rejected") {
    await db
      .update(paymentRequests)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(paymentRequests.id, id));
    return NextResponse.json({ ok: true, message: "تم رفض الطلب." });
  }

  /* ===== تأكيد الدفع + تفعيل الباقة ===== */
  const plan = findPlan(reqRow.plan);
  if (!plan || plan.service) {
    /* خدمة (مراجعة قانونية) — تُسجَّل مدفوعة دون تفعيل اشتراك */
    await db
      .update(paymentRequests)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(paymentRequests.id, id));
    return NextResponse.json({
      ok: true,
      message: "سُجّلت الخدمة كمدفوعة — تابع تنفيذ المراجعة مع العميل.",
    });
  }

  if (!reqRow.userId) {
    return NextResponse.json(
      { ok: false, message: "الطلب غير مرتبط بحساب مستخدم." },
      { status: 409 }
    );
  }

  const now = new Date();
  const expires = plan.unit === "month" ? new Date(now.getTime() + MONTH_DAYS * 864e5) : null;

  await db.transaction(async (tx) => {
    await tx
      .update(paymentRequests)
      .set({ status: "paid", updatedAt: now })
      .where(eq(paymentRequests.id, id));

    const isOnce = plan.unit === "once";
    await tx
      .update(users)
      .set({
        plan: plan.id,
        planExpiresAt: expires,
        paidOnce: isOnce ? true : undefined,
        isSingleUsed: plan.id === "single" ? false : undefined,
      })
      .where(eq(users.id, reqRow.userId!));
  });

  return NextResponse.json({
    ok: true,
    message: `تم التأكيد وتفعيل باقة ${plan.title} على حساب العميل.`,
  });
}
