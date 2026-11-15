import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { findPlan, MONTH_DAYS } from "@/lib/plans";
import { logEvent } from "@/lib/logger";
import { isUserSuspended } from "@/lib/mithaq-guard";
import { readBoundedJson } from "@/lib/contract-text";
import { extractClientIp, noStoreJson } from "@/lib/client-ip";
import { notifyPaymentEvent } from "@/lib/telegram";

export const runtime = "nodejs";

/* ============================================================
   /api/checkout — شحن شام كاش بتفعيل فوري + مراجعة المشرف المسائية
   - يمنع الحسابات المجمّدة مالياً من التفعيل أو الإرسال نهائياً (403)
   - يمنع تكديس أكثر من عملية واحدة قيد المراجعة (unverified) لنفس المستخدم (409)
   - يُفعّل الباقة فوراً للمستخدم بحالة معاملة unverified دون منح paidOnce
     إلا بعد تأكيد المشرف، ويرسل إشعاراً فورياً إلى بوت تيليجرام للمشرف
   ============================================================ */

type Body = {
  planId?: string;
  transactionNumber?: string;
  contactPhone?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return noStoreJson(
      { ok: false, message: "سجّل الدخول أولاً لتتمكن من إتمام الدفع." },
      { status: 401 }
    );
  }

  /* 1. منع الحسابات المجمّدة من إعادة التفعيل أو فتح طلبات دفع جديدة */
  const suspended = await isUserSuspended(session.user.dbId);
  if (suspended) {
    return noStoreJson(
      {
        ok: false,
        message: "حسابك مجمّد بسبب مخالفة مالية سابقة. تواصل مع الدعم لتسوية الوضع.",
      },
      { status: 403 }
    );
  }

  const parsed = await readBoundedJson<Body>(req, 16_384);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const body = parsed.data;

  const planId = String(body.planId || "").trim();
  const txNumber = String(body.transactionNumber || "").trim();
  const phone = String(body.contactPhone || "").trim();

  if (!planId || !txNumber || !phone) {
    return noStoreJson(
      { ok: false, message: "جميع الحقول مطلوبة: الباقة، رقم عملية شام كاش، رقم الهاتف." },
      { status: 422 }
    );
  }

  const plan = findPlan(planId);
  if (!plan || plan.service || plan.priceUsd <= 0) {
    return noStoreJson({ ok: false, message: "الباقة غير موجودة أو غير صالحة." }, { status: 422 });
  }

  /* 2. منع امتلاك أكثر من عملية unverified واحدة في وقت واحد (منع التلاعب المتسلسل) */
  const pendingTx = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, session.user.dbId),
        eq(transactions.status, "unverified")
      )
    )
    .limit(1);
  if (pendingTx.length) {
    return noStoreJson(
      {
        ok: false,
        message:
          "لديك عملية سابقة بانتظار مراجعة الإدارة — لا يمكن إرسال طلب جديد قبل تدقيق العملية الحالية.",
      },
      { status: 409 }
    );
  }

  /* 3. حد إرسال يومي: 3 طلبات كحد أقصى لكل مستخدم خلال 24 ساعة */
  const dayAgo = new Date(Date.now() - 864e5);
  const recentRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, session.user.dbId),
        gte(transactions.createdAt, dayAgo)
      )
    );
  if ((recentRows[0]?.n || 0) >= 3) {
    return noStoreJson(
      {
        ok: false,
        message:
          "أرسلت 3 طلبات خلال آخر 24 ساعة — انتظر مراجعة الحوالات أو تواصل مع الدعم عبر واتساب.",
      },
      { status: 429 }
    );
  }

  /* 4. التحقق من صحة رقم العملية والهاتف */
  if (!/^\d{6,20}$/.test(txNumber)) {
    return noStoreJson(
      { ok: false, message: "رقم عملية شام كاش يجب أن يكون أرقاماً فقط من 6 إلى 20 خانة." },
      { status: 422 }
    );
  }
  if (!/^\d{7,15}$/.test(phone)) {
    return noStoreJson(
      { ok: false, message: "رقم الهاتف يجب أن يكون أرقاماً فقط من 7 إلى 15 خانة." },
      { status: 422 }
    );
  }

  /* 5. منع تكرار رقم العملية (فريد على مستوى الجدول) */
  const dup = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.transactionNumber, txNumber))
    .limit(1);
  if (dup.length) {
    return noStoreJson(
      { ok: false, message: "رقم العملية مُستخدم مسبقاً — تأكد من الرقم الصحيح." },
      { status: 409 }
    );
  }

  const now = new Date();
  const txId = randomUUID();
  const expires =
    plan.unit === "month" ? new Date(now.getTime() + MONTH_DAYS * 864e5) : null;

  /* 6. حفظ المعاملة بحالة unverified + تفعيل فوري للباقة دون منح paidOnce
        (paidOnce لا يُمنح إلا بعد تأكيد المشرف في /admin أو تيليجرام، وفي حال التزوير
        يجمّد المشرف الحساب فتُبطَل الباقة وكل العقود فوراً) */
  try {
    await db.batch([
      db.insert(transactions).values({
        id: txId,
        userId: session.user.dbId,
        transactionNumber: txNumber,
        contactPhone: phone,
        planName: plan.id,
        status: "unverified",
        createdAt: now,
        updatedAt: now,
      }),
      db
        .update(users)
        .set({
          plan: plan.id,
          planExpiresAt: expires,
          isSingleUsed: plan.id === "single" ? false : undefined,
        })
        .where(eq(users.id, session.user.dbId)),
    ]);
  } catch (err) {
    console.error("[checkout] فشل حفظ المعاملة:", err);
    return noStoreJson(
      { ok: false, message: "تعذر حفظ الطلب — حاول مجدداً أو تواصل مع الدعم." },
      { status: 500 }
    );
  }

  const ip = extractClientIp(req.headers);

  await logEvent({
    action: "checkout_submitted",
    entity: "payment",
    entityId: txId,
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `طلب شحن شام كاش رقم ${txNumber} — باقة ${plan.title} — تفعيل فوري بانتظار المراجعة`,
    meta: {
      plan: plan.id,
      txRef: txNumber,
      amount: plan.priceUsd,
      phone,
      ip,
      userAgent: (req.headers.get("user-agent") || "").slice(0, 200),
    },
  });

  /* إشعار فوري للمشرف عبر بوت تيليجرام مع أزرار تأكيد/تجميد مباشر */
  const adminBase = (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin || "")
    .trim()
    .replace(/\/+$/, "");
  notifyPaymentEvent({
    source: "checkout_instant",
    recordKind: "tx",
    recordId: txId,
    planTitle: plan.title,
    planId: plan.id,
    amountUsd: plan.priceUsd,
    amountSyp: plan.priceSyp,
    method: "شام كاش",
    txRef: txNumber,
    phone,
    userName: session.user.name || "",
    userEmail: session.user.email || "",
    adminUrl: adminBase ? `${adminBase}/admin` : undefined,
  }).catch(() => {});

  return noStoreJson({
    ok: true,
    activated: true,
    pendingAudit: true,
    message: `تم تفعيل باقة ${plan.title} فوراً — مزاياك جاهزة الآن. سيراجع الفريق الحوالة في جولة التدقيق، وأي رقم عملية غير مطابق يؤدي لتجميد الحساب وإبطال العقود.`,
  });
}
