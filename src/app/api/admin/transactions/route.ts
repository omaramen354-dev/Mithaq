import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentRequests, transactions, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { findPlan, MONTH_DAYS } from "@/lib/plans";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";

/* ============================================================
   /api/admin/transactions — إدارة معاملات شام كاش (للمشرفين)
   POST: القرار الإداري:
     - verify:   تأكيد الحوالة (unverified  ← verified)
     - suspend:  تجميد الحساب وإبطال الهاش (أي حالة ← suspended)
     - unsuspend: رفع الحظر وإعادة الحساب للعمل (سعلاً من الغلط)
   القاعدة الذهبية: جميع التحويلات المتاحة هنا تُحتفل من المشرف
   فقط، ولا يمكن لأي مسار عام أن يحول الحالة الموثقة ← مجمدة.
   ============================================================ */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.dbId || !session.user.isAdmin) return null;
  return session;
}

async function fetchTx(id: string) {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  return rows[0] || null;
}

type Body = {
  id?: string;
  action?: "verify" | "suspend" | "unsuspend";
};

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }
  const rows = await db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      userName: users.name,
      userEmail: users.email,
      transactionNumber: transactions.transactionNumber,
      contactPhone: transactions.contactPhone,
      planName: transactions.planName,
      status: transactions.status,
      createdAt: transactions.createdAt,
      reviewedAt: transactions.reviewedAt,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.userId, users.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    })),
  });
}

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
  const action = body.action;
  if (!id || (action !== "verify" && action !== "suspend" && action !== "unsuspend")) {
    return NextResponse.json({ ok: false, message: "بيانات القرار ناقصة." }, { status: 422 });
  }

  const tx = await fetchTx(id);
  if (!tx) {
    return NextResponse.json({ ok: false, message: "المعاملة غير موجودة." }, { status: 404 });
  }
  if (tx.status === "suspended" && action !== "unsuspend") {
    return NextResponse.json(
      { ok: false, message: "المعاملة مجمّدة سابقاً — راجع السجل قبل أي قرار." },
      { status: 409 }
    );
  }
  if (tx.status === "verified" && action === "verify") {
    return NextResponse.json({ ok: false, message: "هذه المعاملة موثقة سابقاً." }, { status: 409 });
  }

  const now = new Date();
  const actor = {
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
  };

  /* ===== تجميد الحساب وإبطال الهاش ===== */
  if (action === "suspend") {
    await db
      .update(transactions)
      .set({ status: "suspended", reviewedAt: now, reviewedBy: session.user.dbId, updatedAt: now })
      .where(eq(transactions.id, id));

    /* صدور الحالة المجمدة يعني تجميد المزايا كاملة فوراً */
    if (tx.userId) {
      await db
        .update(users)
        .set({ plan: "free", planExpiresAt: null })
        .where(eq(users.id, tx.userId));
    }

    await logEvent({
      action: "transaction_suspended",
      entity: "payment",
      entityId: id,
      ...actor,
      detail: "تجميد الحساب وإبطال بصمة SHA-256 ورمز QR نظراً لمخالفة مالية",
      meta: { txRef: tx.transactionNumber, plan: tx.planName, targetUser: tx.userId },
    });

    return NextResponse.json({ ok: true, message: "تم تجميد الحساب وإبطال الهاش." });
  }

  /* ===== تأكيد الحوالة يدوياً ===== */
  if (action === "verify") {
    await db
      .update(transactions)
      .set({ status: "verified", reviewedAt: now, reviewedBy: session.user.dbId, updatedAt: now })
      .where(eq(transactions.id, id));

    const plan = findPlan(tx.planName) || findPlan(tx.planName.toLowerCase());
    if (!plan || plan.service || !tx.userId) {
      // لا يمكن تعيين باقة موثوقة — يبقى صالحاً كإثبات دفعة فقط
      await logEvent({
        action: "transaction_verified_no_plan",
        entity: "payment",
        entityId: id,
        ...actor,
        detail: `تأكيد الحوالة — رقم العملية ${tx.transactionNumber} — لم نجد باقة مطابقة (${tx.planName})`,
        meta: { plan: tx.planName, targetUser: tx.userId },
      });
      return NextResponse.json({
        ok: true,
        message: "تم التأكيد — لم نعثر على باقة مقابلة (سُجّل الإثبات فقط).",
      });
    }

    const expires = plan.unit === "month" ? new Date(now.getTime() + MONTH_DAYS * 864e5) : null;
    const isOnce = plan.unit === "once";

    await db.batch([
      db
        .update(paymentRequests)
        .set({ status: "paid", updatedAt: now })
        .where(eq(paymentRequests.userId, tx.userId)),
      db
        .update(users)
        .set({
          plan: plan.id,
          planExpiresAt: expires,
          paidOnce: isOnce ? true : undefined,
          isSingleUsed: plan.id === "single" ? false : undefined,
        })
        .where(eq(users.id, tx.userId)),
    ]);

    await logEvent({
      action: "transaction_verified",
      entity: "payment",
      entityId: id,
      ...actor,
      detail: `تأكيد الحوالة رقم ${tx.transactionNumber} وتفعيل باقة ${plan.title}`,
      meta: { plan: plan.id, targetUser: tx.userId },
    });

    return NextResponse.json({ ok: true, message: `تم التأكيد وتفعيل باقة ${plan.title}.` });
  }

  /* ===== رفع الحظر (unsuspend) — إعادة الحالة إلى unverified ===== */
  await db
    .update(transactions)
    .set({ status: "unverified", reviewedAt: now, reviewedBy: session.user.dbId, updatedAt: now })
    .where(eq(transactions.id, id));

  await logEvent({
    action: "transaction_unsuspended",
    entity: "payment",
    entityId: id,
    ...actor,
    detail: `رفع الحظر — المعاملة ${tx.transactionNumber} — إعادة فحص`,
    meta: { txRef: tx.transactionNumber },
  });

  return NextResponse.json({ ok: true, message: "تم رفع الحظر — المعاملة عادت غير موثقة." });
}
