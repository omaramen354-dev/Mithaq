/* ============================================================
   payment-decisions.ts — محرّك قرارات الدفع الموحد (لوحة الأدمن + أزرار تيليجرام)
   يضمن أن قرار التأكيد أو التجميد أو فك التجميد ينفّذ نفس المنطق المالي
   والأمني الصارم سواء صدر من /admin أو بضغطة واحدة داخل بوت تيليجرام.
   ============================================================ */

import { db } from "@/db";
import { paymentRequests, transactions, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { findPlan, MONTH_DAYS } from "@/lib/plans";
import { logEvent } from "@/lib/logger";

export type DecisionActor = {
  actorId?: string | null;
  actorName: string;
  actorEmail: string;
  via?: "admin" | "telegram";
};

export type DecisionResult = {
  ok: boolean;
  status: number;
  message: string;
  alreadyDone?: boolean;
};

/* ============================================================
   1) قرارات معاملات شام كاش (جدول transactions)
   ============================================================ */
export async function decideTransaction(
  id: string,
  action: "verify" | "suspend" | "unsuspend",
  actor: DecisionActor
): Promise<DecisionResult> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  const tx = rows[0];
  if (!tx) {
    return { ok: false, status: 404, message: "المعاملة غير موجودة." };
  }
  if (tx.status === "suspended" && action !== "unsuspend") {
    return {
      ok: false,
      status: 409,
      alreadyDone: action === "suspend",
      message: "المعاملة مجمّدة سابقاً — راجع السجل قبل أي قرار.",
    };
  }
  if (tx.status === "verified" && action === "verify") {
    return {
      ok: false,
      status: 409,
      alreadyDone: true,
      message: "هذه المعاملة موثقة سابقاً.",
    };
  }

  const now = new Date();
  const suffix = actor.via === "telegram" ? " (عبر تيليجرام)" : "";
  const reviewedBy = actor.actorId || null;

  /* ===== تجميد الحساب وإبطال المزايا و paidOnce فوراً ===== */
  if (action === "suspend") {
    await db
      .update(transactions)
      .set({
        status: "suspended",
        reviewedAt: now,
        reviewedBy,
        updatedAt: now,
      })
      .where(eq(transactions.id, id));

    if (tx.userId) {
      await db
        .update(users)
        .set({
          plan: "free",
          planExpiresAt: null,
          paidOnce: false,
          isSingleUsed: false,
        })
        .where(eq(users.id, tx.userId));
    }

    await logEvent({
      action: "transaction_suspended",
      entity: "payment",
      entityId: id,
      actorId: reviewedBy,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
      detail: `تجميد الحساب وإبطال بصمة SHA-256 ورمز QR نظراً لمخالفة مالية${suffix}`,
      meta: {
        txRef: tx.transactionNumber,
        plan: tx.planName,
        targetUser: tx.userId,
        via: actor.via || "admin",
      },
    });

    return {
      ok: true,
      status: 200,
      message: "تم تجميد الحساب وإبطال الهاش ورموز QR فوراً.",
    };
  }

  /* ===== تأكيد الحوالة يدوياً ===== */
  if (action === "verify") {
    await db
      .update(transactions)
      .set({
        status: "verified",
        reviewedAt: now,
        reviewedBy,
        updatedAt: now,
      })
      .where(eq(transactions.id, id));

    const plan = findPlan(tx.planName) || findPlan(tx.planName.toLowerCase());
    if (!plan || plan.service || !tx.userId) {
      await logEvent({
        action: "transaction_verified_no_plan",
        entity: "payment",
        entityId: id,
        actorId: reviewedBy,
        actorName: actor.actorName,
        actorEmail: actor.actorEmail,
        detail: `تأكيد الحوالة — رقم العملية ${tx.transactionNumber} — لم نجد باقة مطابقة (${tx.planName})${suffix}`,
        meta: { plan: tx.planName, targetUser: tx.userId, via: actor.via || "admin" },
      });
      return {
        ok: true,
        status: 200,
        message: "تم التأكيد — لم نعثر على باقة مقابلة (سُجّل الإثبات فقط).",
      };
    }

    const [targetUser] = await db
      .select({
        plan: users.plan,
        planExpiresAt: users.planExpiresAt,
        isSingleUsed: users.isSingleUsed,
      })
      .from(users)
      .where(eq(users.id, tx.userId))
      .limit(1);

    const alreadyActiveSamePlan = targetUser?.plan === plan.id;
    const existingFutureExpiry =
      targetUser?.planExpiresAt && targetUser.planExpiresAt.getTime() > now.getTime()
        ? targetUser.planExpiresAt
        : null;
    const expires =
      plan.unit === "month"
        ? alreadyActiveSamePlan && existingFutureExpiry
          ? existingFutureExpiry
          : new Date(now.getTime() + MONTH_DAYS * 864e5)
        : null;
    const isOnce = plan.unit === "once";

    await db.batch([
      db
        .update(paymentRequests)
        .set({ status: "paid", updatedAt: now })
        .where(
          and(
            eq(paymentRequests.userId, tx.userId),
            inArray(paymentRequests.status, ["pending", "manual_review"])
          )
        ),
      db
        .update(users)
        .set({
          plan: plan.id,
          planExpiresAt: expires,
          paidOnce: isOnce ? true : undefined,
          /* إذا كانت الباقة single مفعّلة مسبقاً عبر الشراء الفوري فلا نُصفّر
             isSingleUsed حتى لا يحصل العميل على عقد ثانٍ مجاناً عند التدقيق المسائي */
          isSingleUsed:
            plan.id === "single"
              ? alreadyActiveSamePlan
                ? Boolean(targetUser?.isSingleUsed)
                : false
              : undefined,
        })
        .where(eq(users.id, tx.userId)),
    ]);

    await logEvent({
      action: "transaction_verified",
      entity: "payment",
      entityId: id,
      actorId: reviewedBy,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
      detail: `تأكيد الحوالة رقم ${tx.transactionNumber} وتفعيل باقة ${plan.title}${suffix}`,
      meta: { plan: plan.id, targetUser: tx.userId, via: actor.via || "admin" },
    });

    return {
      ok: true,
      status: 200,
      message: `تم التأكيد وتفعيل باقة ${plan.title}.`,
    };
  }

  /* ===== رفع الحظر (unsuspend) ===== */
  await db
    .update(transactions)
    .set({
      status: "unverified",
      reviewedAt: now,
      reviewedBy,
      updatedAt: now,
    })
    .where(eq(transactions.id, id));

  await logEvent({
    action: "transaction_unsuspended",
    entity: "payment",
    entityId: id,
    actorId: reviewedBy,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    detail: `رفع الحظر — المعاملة ${tx.transactionNumber} — إعادة فحص${suffix}`,
    meta: { txRef: tx.transactionNumber, via: actor.via || "admin" },
  });

  return {
    ok: true,
    status: 200,
    message: "تم رفع الحظر — المعاملة عادت للمراجعة.",
  };
}

/* ============================================================
   2) قرارات طلبات الدفع (USDT TRC20 / شام كاش — جدول payment_requests)
   - paid:     تأكيد الدفعة نهائياً وتثبيت الباقة و paidOnce
   - rejected: رفض الطلب (وإن كان مفعّلاً فورياً manual_review يُجمّد الحساب!)
   - freeze:   رفض الطلب + تجميد الحساب فوراً وإبطال بصمة عقوده وQR
   - unfreeze: فك التجميد عن طلب مجمّد وإعادة تفعيل باقته (تراجع من تيليجرام)
   ============================================================ */
export async function decidePaymentRequest(
  id: string,
  action: "paid" | "rejected" | "freeze" | "unfreeze",
  actor: DecisionActor
): Promise<DecisionResult> {
  const rows = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.id, id))
    .limit(1);
  const reqRow = rows[0];
  if (!reqRow) {
    return { ok: false, status: 404, message: "الطلب غير موجود." };
  }

  const now = new Date();
  const suffix = actor.via === "telegram" ? " (عبر تيليجرام)" : "";
  const actorId = actor.actorId || null;
  const suspKey = `PR-${id.slice(0, 12).toUpperCase()}`;

  /* ===== فك التجميد وتأكيد الدفعة (تراجع بضغطة واحدة من تيليجرام) ===== */
  if (action === "unfreeze") {
    const plan = findPlan(reqRow.plan);
    await db
      .update(transactions)
      .set({ status: "verified", reviewedAt: now, reviewedBy: actorId, updatedAt: now })
      .where(eq(transactions.transactionNumber, suspKey));

    await db
      .update(paymentRequests)
      .set({ status: "paid", updatedAt: now })
      .where(eq(paymentRequests.id, id));

    if (reqRow.userId && plan && !plan.service) {
      const expires =
        plan.unit === "month" ? new Date(now.getTime() + MONTH_DAYS * 864e5) : null;
      await db
        .update(users)
        .set({
          plan: plan.id,
          planExpiresAt: expires,
          paidOnce: plan.unit === "once" ? true : undefined,
        })
        .where(eq(users.id, reqRow.userId));
    }

    await logEvent({
      action: "payment_unfrozen",
      entity: "payment",
      entityId: id,
      actorId,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
      detail: `فك التجميد وتأكيد دفعة (${reqRow.plan}) عبر ${reqRow.method}${suffix}`,
      meta: { plan: reqRow.plan, method: reqRow.method, targetUser: reqRow.userId, via: actor.via || "admin" },
    });

    return {
      ok: true,
      status: 200,
      message: "تم فك التجميد وإعادة تفعيل الباقة بنجاح.",
    };
  }

  if (reqRow.status === "paid" && action === "paid") {
    return {
      ok: false,
      status: 409,
      alreadyDone: true,
      message: "هذا الطلب مؤكّد سابقاً.",
    };
  }
  if (reqRow.status === "rejected" && (action === "rejected" || action === "freeze")) {
    return {
      ok: false,
      status: 409,
      alreadyDone: true,
      message: "هذا الطلب مرفوض سابقاً.",
    };
  }
  if (reqRow.status === "paid" || reqRow.status === "rejected") {
    return { ok: false, status: 409, message: "هذا الطلب عولج سابقاً." };
  }

  /* ===== رفض أو تجميد (أي طلب manual_review مفعّل فورياً يُجمّد حسابه عند الرفض!) ===== */
  const shouldFreeze =
    action === "freeze" || (action === "rejected" && reqRow.status === "manual_review");

  if (action === "rejected" || action === "freeze") {
    await db
      .update(paymentRequests)
      .set({ status: "rejected", updatedAt: now })
      .where(eq(paymentRequests.id, id));

    if (shouldFreeze && reqRow.userId) {
      await db
        .update(users)
        .set({
          plan: "free",
          planExpiresAt: null,
          paidOnce: false,
          isSingleUsed: false,
        })
        .where(eq(users.id, reqRow.userId));

      /* تسجيل سجل suspended في جدول transactions حتى تُفعَّل isUserSuspended
         و isOwnerSuspended فوراً على /verify و /share و /print و /api/contracts */
      const existingSusp = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.transactionNumber, suspKey))
        .limit(1);

      if (existingSusp.length) {
        await db
          .update(transactions)
          .set({ status: "suspended", reviewedAt: now, reviewedBy: actorId, updatedAt: now })
          .where(eq(transactions.id, existingSusp[0].id));
      } else {
        await db.insert(transactions).values({
          userId: reqRow.userId,
          transactionNumber: suspKey,
          contactPhone: reqRow.method.toUpperCase(),
          planName: reqRow.plan,
          status: "suspended",
          adminNote: `تجميد بسبب دفعة غير مطابقة (${reqRow.method}): ${(reqRow.txRef || "").slice(0, 80)}`,
          reviewedBy: actorId,
          reviewedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await logEvent({
      action: shouldFreeze ? "payment_rejected_and_suspended" : "payment_rejected",
      entity: "payment",
      entityId: id,
      actorId,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
      detail: shouldFreeze
        ? `رفض دفعة (${reqRow.plan}) عبر ${reqRow.method} وتجميد الحساب وإبطال بصمة عقوده${suffix}`
        : `رفض طلب دفعة (${reqRow.plan}) — ${reqRow.amountUsd} USDT عبر ${reqRow.method}${suffix}`,
      meta: {
        plan: reqRow.plan,
        method: reqRow.method,
        txRef: reqRow.txRef,
        targetUser: reqRow.userId,
        frozen: shouldFreeze,
        via: actor.via || "admin",
      },
    });

    return {
      ok: true,
      status: 200,
      message: shouldFreeze
        ? "تم رفض الدفعة وتجميد الحساب وإبطال بصمة عقوده وQR فوراً."
        : "تم رفض الطلب.",
    };
  }

  /* ===== تأكيد الدفعة وتفعيل / تثبيت الباقة ===== */
  const plan = findPlan(reqRow.plan);
  if (!plan || plan.service) {
    await db
      .update(paymentRequests)
      .set({ status: "paid", updatedAt: now })
      .where(eq(paymentRequests.id, id));
    await logEvent({
      action: "payment_confirmed",
      entity: "payment",
      entityId: id,
      actorId,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
      detail: `تأكيد دفع خدمة (${reqRow.plan}) — ${reqRow.amountUsd} USDT عبر ${reqRow.method}${suffix}`,
      meta: { plan: reqRow.plan, method: reqRow.method, txRef: reqRow.txRef, via: actor.via || "admin" },
    });
    return {
      ok: true,
      status: 200,
      message: "سُجّلت الخدمة كمدفوعة — تابع تنفيذ المراجعة مع العميل.",
    };
  }

  if (!reqRow.userId) {
    return { ok: false, status: 409, message: "الطلب غير مرتبط بحساب مستخدم." };
  }

  const [targetUser] = await db
    .select({
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      isSingleUsed: users.isSingleUsed,
    })
    .from(users)
    .where(eq(users.id, reqRow.userId))
    .limit(1);

  const alreadyActiveSamePlan = targetUser?.plan === plan.id;
  const existingFutureExpiry =
    targetUser?.planExpiresAt && targetUser.planExpiresAt.getTime() > now.getTime()
      ? targetUser.planExpiresAt
      : null;
  const expires =
    plan.unit === "month"
      ? alreadyActiveSamePlan && existingFutureExpiry
        ? existingFutureExpiry
        : new Date(now.getTime() + MONTH_DAYS * 864e5)
      : null;
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
        isSingleUsed:
          plan.id === "single"
            ? alreadyActiveSamePlan
              ? Boolean(targetUser?.isSingleUsed)
              : false
            : undefined,
      })
      .where(eq(users.id, reqRow.userId)),
  ]);

  await logEvent({
    action: "payment_confirmed",
    entity: "payment",
    entityId: id,
    actorId,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    detail: `تأكيد دفعة (${reqRow.plan}) — ${reqRow.amountUsd} USDT عبر ${reqRow.method} وتفعيل باقة ${plan.title}${suffix}`,
    meta: {
      plan: plan.id,
      method: reqRow.method,
      txRef: reqRow.txRef,
      targetUser: reqRow.userId,
      via: actor.via || "admin",
    },
  });

  return {
    ok: true,
    status: 200,
    message: `تم التأكيد وتفعيل باقة ${plan.title} على حساب العميل.`,
  };
}
