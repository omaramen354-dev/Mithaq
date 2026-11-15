import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, paymentRequests, transactions, users } from "@/db/schema";
import { and, eq, gte, ilike, inArray, sql } from "drizzle-orm";
import { findPlan, MONTH_DAYS } from "@/lib/plans";
import { isUuid } from "@/lib/contract-schema";
import { isUserSuspended } from "@/lib/mithaq-guard";
import { readBoundedJson, normalize } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";
import { notifyPaymentEvent } from "@/lib/telegram";
import { logEvent } from "@/lib/logger";
import { isValidTronTxid, verifyUsdtTrc20Transfer } from "@/lib/tron-verify";

export const runtime = "nodejs";

/* ============================================================
   POST /api/payment-requests — طلبات الدفع (USDT TRC20 / شام كاش)
   - فحص حجم الجسم وحدود الطول الصارمة + التحقق من ملكية contractId
   - منع تكرار نفس رقم العملية/TXID على مستوى النظام (منع Replay Attack)
   - عند الدفع بـ USDT (TRC20) لباقة قياسية:
     • إن كان TXID بصيغة TRON 64-hex: نفحص بلوكشين TRON عبر TronGrid:
       - تطابق مؤكد ← تفعيل فوري بحالة paid (لا يحتاج مراجعة).
       - عدم تطابق مؤكد (محفظة خاطئة/مبلغ ناقص/عملية فاشلة) ← رفض فوري 422.
       - تعذر الشبكة/عدم الفهرسة بعد ← تفعيل فوري بحالة manual_review + أزرار تيليجرام.
     • وإن كان مرجع تحويل داخلي (مثل Binance/OKX ID) ← تفعيل فوري بحالة manual_review
       مع إرسال إشعار فوري إلى تيليجرام يحتوي على أزرار (✅ تأكيد / ❄️ تجميد مباشر)
       للمراجعة المسائية تماماً مثل شام كاش (مع منع التكديس وعدم منح paidOnce قبل التأكيد).
   ============================================================ */

type Body = {
  plan?: string;
  method?: string;
  txRef?: string;
  senderName?: string;
  contractId?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return noStoreJson(
      { ok: false, message: "سجّل الدخول أولاً حتى يُربط الطلب بحسابك." },
      { status: 401 }
    );
  }

  const suspended = await isUserSuspended(session.user.dbId);
  if (suspended) {
    return noStoreJson(
      { ok: false, message: "حسابك مجمّد مالياً — تواصل مع الدعم لتسوية الوضع." },
      { status: 403 }
    );
  }

  const parsed = await readBoundedJson<Body>(req, 16_384);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const body = parsed.data;

  const plan = findPlan(String(body.plan || "").trim());
  if (!plan || plan.id === "free") {
    return noStoreJson({ ok: false, message: "الباقة غير صحيحة." }, { status: 422 });
  }
  const method = body.method === "shamcash" ? "shamcash" : "usdt";
  const txRef = normalize(body.txRef);
  const senderName = normalize(body.senderName);

  if (txRef.length < 6 || txRef.length > 120) {
    return noStoreJson(
      { ok: false, message: "رقم العملية/الإيصال يجب أن يكون بين 6 و 120 حرفاً." },
      { status: 422 }
    );
  }
  if (senderName.length > 120) {
    return noStoreJson(
      { ok: false, message: "اسم المُرسل أطول من المسموح (الحد الأقصى 120 حرفاً)." },
      { status: 422 }
    );
  }
  if (method === "shamcash" && senderName.length < 3) {
    return noStoreJson(
      { ok: false, message: "أدخل اسم المُرسل على شام كاش." },
      { status: 422 }
    );
  }

  /* التحقق من contractId إذا أُرسل: UUID صالح + مملوك للمستخدم نفسه (منع IDOR) */
  let verifiedContractId: string | null = null;
  if (body.contractId !== undefined && body.contractId !== null && String(body.contractId).trim() !== "") {
    const rawCid = String(body.contractId).trim();
    if (!isUuid(rawCid)) {
      return noStoreJson({ ok: false, message: "معرّف العقد غير صالح." }, { status: 422 });
    }
    const owned = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(and(eq(contracts.id, rawCid), eq(contracts.ownerId, session.user.dbId)))
      .limit(1);
    if (!owned.length) {
      return noStoreJson(
        { ok: false, message: "العقد المرتبط غير موجود أو لا يعود لحسابك." },
        { status: 403 }
      );
    }
    verifiedContractId = rawCid;
  }

  /* حد يومي: 5 طلبات كحد أقصى لكل مستخدم خلال 24 ساعة */
  const dayAgo = new Date(Date.now() - 864e5);
  const recent = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.userId, session.user.dbId),
        gte(paymentRequests.createdAt, dayAgo)
      )
    );
  if ((recent[0]?.n || 0) >= 5) {
    return noStoreJson(
      {
        ok: false,
        message: "أرسلت طلبات كثيرة خلال 24 ساعة — انتظر المراجعة أو تواصل مع الدعم.",
      },
      { status: 429 }
    );
  }

  /* منع إعادة استخدام نفس TXID/رقم الإيصال عبر أي حساب (منع Replay Attack) */
  const dupTx = await db
    .select({ id: paymentRequests.id })
    .from(paymentRequests)
    .where(
      and(
        ilike(paymentRequests.txRef, `${txRef}%`),
        inArray(paymentRequests.status, ["pending", "manual_review", "paid"])
      )
    )
    .limit(1);
  if (dupTx.length) {
    return noStoreJson(
      { ok: false, message: "رقم العملية (TXID / الإيصال) مُستخدم مسبقاً — تأكد من الرقم الصحيح." },
      { status: 409 }
    );
  }

  /* منع التكرار: طلب معلّق أو مؤكد لنفس الباقة لنفس المستخدم */
  const existing = await db
    .select({ id: paymentRequests.id, status: paymentRequests.status })
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.userId, session.user.dbId),
        eq(paymentRequests.plan, plan.id),
        inArray(paymentRequests.status, ["pending", "manual_review", "paid"])
      )
    )
    .limit(1);

  if (existing.length) {
    const s = existing[0].status;
    return noStoreJson(
      {
        ok: false,
        message:
          s === "paid"
            ? "هذه الباقة مفعّلة في حسابك أصلاً."
            : "لديك طلب قيد المراجعة لنفس الباقة — تابع حالته من الصفحة.",
      },
      { status: 409 }
    );
  }

  const isEligibleUsdtInstant = method === "usdt" && !plan.service;

  /* منع التكديس المتسلسل لطلبات التفعيل الفوري غير المدققة (شام كاش أو USDT) */
  if (isEligibleUsdtInstant) {
    const [pendingTx, pendingInstantPr] = await Promise.all([
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, session.user.dbId),
            eq(transactions.status, "unverified")
          )
        )
        .limit(1),
      db
        .select({ id: paymentRequests.id })
        .from(paymentRequests)
        .where(
          and(
            eq(paymentRequests.userId, session.user.dbId),
            eq(paymentRequests.status, "manual_review")
          )
        )
        .limit(1),
    ]);
    if (pendingTx.length || pendingInstantPr.length) {
      return noStoreJson(
        {
          ok: false,
          message:
            "لديك عملية دفع سابقة مفعّلة بانتظار مراجعة الإدارة — لا يمكن تفعيل طلب جديد قبل تدقيق العملية الحالية.",
        },
        { status: 409 }
      );
    }
  }

  const storedTxRef = [txRef, senderName ? "الاسم: " + senderName : ""]
    .filter(Boolean)
    .join(" | ");
  const adminBase = (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin || "")
    .trim()
    .replace(/\/+$/, "");
  const now = new Date();
  const reqId = randomUUID();

  /* ===== 1. التحقق التلقائي الفوري من USDT TRC20 عبر TronGrid المجاني ===== */
  if (isEligibleUsdtInstant && isValidTronTxid(txRef)) {
    const check = await verifyUsdtTrc20Transfer(txRef, plan.priceUsd);

    if (check.status === "invalid") {
      return noStoreJson({ ok: false, message: check.reason }, { status: 422 });
    }

    if (check.status === "verified") {
      const expires =
        plan.unit === "month"
          ? new Date(now.getTime() + MONTH_DAYS * 864e5)
          : null;
      const isOnce = plan.unit === "once";

      await db.batch([
        db.insert(paymentRequests).values({
          id: reqId,
          userId: session.user.dbId,
          contractId: verifiedContractId,
          plan: plan.id,
          amountUsd: String(check.amountUsdt.toFixed(2)),
          method: "usdt",
          status: "paid",
          txRef: storedTxRef,
          createdAt: now,
          updatedAt: now,
        }),
        db
          .update(users)
          .set({
            plan: plan.id,
            planExpiresAt: expires,
            paidOnce: isOnce ? true : undefined,
            isSingleUsed: plan.id === "single" ? false : undefined,
          })
          .where(eq(users.id, session.user.dbId)),
      ]);

      await logEvent({
        action: "usdt_auto_verified",
        entity: "payment",
        entityId: reqId,
        actorId: session.user.dbId,
        actorName: session.user.name || "",
        actorEmail: session.user.email || "",
        detail: `تحقق تلقائي فوري من بلوكشين TRON (${check.amountUsdt.toFixed(2)} USDT) وتفعيل باقة ${plan.title}`,
        meta: { plan: plan.id, txRef, amountUsdt: check.amountUsdt },
      });

      notifyPaymentEvent({
        source: "usdt_auto_verified",
        recordKind: "pr",
        recordId: reqId,
        planTitle: plan.title,
        planId: plan.id,
        amountUsd: check.amountUsdt,
        method: "USDT (TRC20) — تحقق تلقائي من البلوكشين ✓",
        txRef,
        userName: session.user.name || "",
        userEmail: session.user.email || "",
        adminUrl: adminBase ? `${adminBase}/admin` : undefined,
      }).catch(() => {});

      return noStoreJson(
        {
          ok: true,
          autoVerified: true,
          message: `تم التحقق من تحويل ${check.amountUsdt.toFixed(2)} USDT تلقائياً على شبكة TRON وتفعيل باقة «${plan.title}» فوراً!`,
        },
        { status: 201 }
      );
    }
    /* حالة unavailable (الشبكة لم تفهرس المعاملة بعد أو تعذّر الاتصال)
       تنتقل للتفعيل الفوري مع المراجعة المسائية عبر تيليجرام أدناه */
  }

  /* ===== 2. تفعيل فوري لدفعات USDT (TRC20) مع المراجعة المسائية من تيليجرام ===== */
  if (isEligibleUsdtInstant) {
    const expires =
      plan.unit === "month"
        ? new Date(now.getTime() + MONTH_DAYS * 864e5)
        : null;

    await db.batch([
      db.insert(paymentRequests).values({
        id: reqId,
        userId: session.user.dbId,
        contractId: verifiedContractId,
        plan: plan.id,
        amountUsd: String(plan.priceUsd),
        method: "usdt",
        status: "manual_review",
        txRef: storedTxRef,
        createdAt: now,
        updatedAt: now,
      }),
      /* تفعيل فوري دون منح paidOnce إلا بعد تأكيد المشرف (تيليجرام أو /admin) */
      db
        .update(users)
        .set({
          plan: plan.id,
          planExpiresAt: expires,
          isSingleUsed: plan.id === "single" ? false : undefined,
        })
        .where(eq(users.id, session.user.dbId)),
    ]);

    await logEvent({
      action: "usdt_instant_activated",
      entity: "payment",
      entityId: reqId,
      actorId: session.user.dbId,
      actorName: session.user.name || "",
      actorEmail: session.user.email || "",
      detail: `تفعيل فوري لدفعة USDT (TRC20) رقم ${txRef} — باقة ${plan.title} بانتظار المراجعة المسائية`,
      meta: { plan: plan.id, txRef, amountUsd: plan.priceUsd },
    });

    notifyPaymentEvent({
      source: "usdt_instant",
      recordKind: "pr",
      recordId: reqId,
      planTitle: plan.title,
      planId: plan.id,
      amountUsd: plan.priceUsd,
      amountSyp: plan.priceSyp,
      method: "USDT (TRC20)",
      txRef,
      userName: session.user.name || "",
      userEmail: session.user.email || "",
      adminUrl: adminBase ? `${adminBase}/admin` : undefined,
    }).catch(() => {});

    return noStoreJson(
      {
        ok: true,
        autoVerified: true,
        pendingAudit: true,
        message: `تم تفعيل باقة «${plan.title}» فوراً — مزاياك جاهزة الآن! سيراجع الفريق رقم الحوالة في التدقيق المسائي، وأي رقم غير مطابق يعرّض الحساب للتجميد وإبطال العقود.`,
      },
      { status: 201 }
    );
  }

  /* ===== 3. طلبات الخدمات (مثل المراجعة القانونية) أو شام كاش من النافذة ===== */
  await db.insert(paymentRequests).values({
    id: reqId,
    userId: session.user.dbId,
    contractId: verifiedContractId,
    plan: plan.id,
    amountUsd: String(plan.priceUsd),
    method,
    status: "pending",
    txRef: storedTxRef,
    createdAt: now,
    updatedAt: now,
  });

  /* إشعار فوري للمشرف على تيليجرام مع أزرار التأكيد/التجميد المباشرة */
  notifyPaymentEvent({
    source: "payment_request",
    recordKind: "pr",
    recordId: reqId,
    planTitle: plan.title,
    planId: plan.id,
    amountUsd: plan.priceUsd,
    amountSyp: plan.priceSyp,
    method: method === "shamcash" ? "شام كاش" : "USDT (TRC20)",
    txRef: [txRef, senderName ? `المرسل: ${senderName}` : ""].filter(Boolean).join(" | "),
    userName: session.user.name || "",
    userEmail: session.user.email || "",
    adminUrl: adminBase ? `${adminBase}/admin` : undefined,
  }).catch(() => {});

  return noStoreJson(
    {
      ok: true,
      autoVerified: false,
      message: "تم إرسال طلبك بنجاح — سيراجعه الفريق ويُفعّل باقتك قريباً.",
    },
    { status: 201 }
  );
}
