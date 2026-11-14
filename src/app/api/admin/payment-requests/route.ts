import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { paymentRequests, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { findPlan, MONTH_DAYS } from "@/lib/plans";
import { logEvent } from "@/lib/logger";
import { readBoundedJson } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   /api/admin/payment-requests — إدارة طلبات الدفع (للمشرفين)
   ============================================================ */

const requireAdmin = requireAdminSession;

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(paymentRequests)
    .orderBy(desc(paymentRequests.createdAt))
    .limit(50);
  return noStoreJson({ ok: true, requests: rows });
}

type Body = { id?: string; action?: "paid" | "rejected"; note?: string };

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

  const id = String(body.id || "").trim();
  if (!isUuid(id) || (body.action !== "paid" && body.action !== "rejected")) {
    return noStoreJson({ ok: false, message: "بيانات القرار غير صالحة." }, { status: 422 });
  }

  const rows = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.id, id))
    .limit(1);
  const reqRow = rows[0];
  if (!reqRow) {
    return noStoreJson({ ok: false, message: "الطلب غير موجود." }, { status: 404 });
  }
  if (reqRow.status === "paid" || reqRow.status === "rejected") {
    return noStoreJson(
      { ok: false, message: "هذا الطلب عولج سابقاً." },
      { status: 409 }
    );
  }

  if (body.action === "rejected") {
    await db
      .update(paymentRequests)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(paymentRequests.id, id));

    await logEvent({
      action: "payment_rejected",
      entity: "payment",
      entityId: id,
      actorId: session.user.dbId,
      actorName: session.user.name || "",
      actorEmail: session.user.email || "",
      detail: `رفض طلب دفعة (${reqRow.plan}) — ${reqRow.amountUsd} USDT عبر ${reqRow.method}`,
      meta: { plan: reqRow.plan, method: reqRow.method, txRef: reqRow.txRef },
    });

    return noStoreJson({ ok: true, message: "تم رفض الطلب." });
  }

  const plan = findPlan(reqRow.plan);
  if (!plan || plan.service) {
    await db
      .update(paymentRequests)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(paymentRequests.id, id));
    return noStoreJson({
      ok: true,
      message: "سُجّلت الخدمة كمدفوعة — تابع تنفيذ المراجعة مع العميل.",
    });
  }

  if (!reqRow.userId) {
    return noStoreJson(
      { ok: false, message: "الطلب غير مرتبط بحساب مستخدم." },
      { status: 409 }
    );
  }

  const now = new Date();
  const expires = plan.unit === "month" ? new Date(now.getTime() + MONTH_DAYS * 864e5) : null;
  const isOnce = plan.unit === "once";

  await db.batch([
    db
      .update(paymentRequests)
      .set({ status: "paid", updatedAt: now })
      .where(eq(paymentRequests.id, id)),
    db
      .update(users)
      .set({
        plan: plan.id,
        planExpiresAt: expires,
        paidOnce: isOnce ? true : undefined,
        isSingleUsed: plan.id === "single" ? false : undefined,
      })
      .where(eq(users.id, reqRow.userId!)),
  ]);

  await logEvent({
    action: "payment_confirmed",
    entity: "payment",
    entityId: id,
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `تأكيد دفعة (${reqRow.plan}) — ${reqRow.amountUsd} USDT عبر ${reqRow.method} وتفعيل باقة ${plan.title}`,
    meta: { plan: plan.id, method: reqRow.method, txRef: reqRow.txRef, targetUser: reqRow.userId },
  });

  return noStoreJson({
    ok: true,
    message: `تم التأكيد وتفعيل باقة ${plan.title} على حساب العميل.`,
  });
}
