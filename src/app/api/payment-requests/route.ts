import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, paymentRequests } from "@/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { findPlan } from "@/lib/plans";
import { isUuid } from "@/lib/contract-schema";
import { isUserSuspended } from "@/lib/mithaq-guard";
import { readBoundedJson, normalize } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";
import { notifyPaymentEvent } from "@/lib/telegram";

export const runtime = "nodejs";

/* ============================================================
   POST /api/payment-requests — إنشاء طلب دفع (تأكيد يدوي)
   - فحص حجم الجسم وحدود الطول الصارمة على txRef و senderName
   - التحقق من ملكية contractId إذا أُرسل (منع IDOR + منع 22P02)
   - منع الحسابات المجمّدة من فتح طلبات جديدة
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

  await db.insert(paymentRequests).values({
    userId: session.user.dbId,
    contractId: verifiedContractId,
    plan: plan.id,
    amountUsd: String(plan.priceUsd),
    method,
    status: "pending",
    txRef: [txRef, senderName ? "الاسم: " + senderName : ""].filter(Boolean).join(" | "),
  });

  /* إشعار فوري للمشرف على تيليجرام بوجود طلب دفع جديد */
  const adminBase = (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin || "").replace(/\/+$/, "");
  notifyPaymentEvent({
    source: "payment_request",
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
      message: "تم إرسال طلبك بنجاح — سيراجعه الفريق ويُفعّل باقتك قريباً.",
    },
    { status: 201 }
  );
}
