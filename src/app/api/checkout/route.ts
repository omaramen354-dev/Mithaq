import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findPlan, MONTH_DAYS } from "@/lib/plans";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";

/* ============================================================
   /api/checkout — إرسال طلب شحن رصيد شام كاش
   POST: يستقبل { planId, transactionNumber, contactPhone }
   - يتحقق من تسجيل المستخدم وصحة الرقم والباقة.
   - يمنع تكرار نفس رقم العملية (unique).
   - يُنشئ معاملة بحالة unverified ويُفعّل المزايا فوراً وتلقائياً
     بالكامل (unverified = مزايا كاملة فوراً — الأدمن يؤكد لاحقاً).
   ============================================================ */

type Body = {
  planId?: string;
  transactionNumber?: string;
  contactPhone?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json(
      { ok: false, message: "سجّل الدخول أولاً لتتمكن من إتمام الدفع." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  const planId = (body.planId || "").trim();
  const txNumber = (body.transactionNumber || "").trim();
  const phone = (body.contactPhone || "").trim();

  if (!planId || !txNumber || !phone) {
    return NextResponse.json(
      { ok: false, message: "جميع الحقول مطلوبة: الباقة، رقم عملية شام كاش، رقم الهاتف." },
      { status: 422 }
    );
  }

  const plan = findPlan(planId);
  if (!plan || plan.service) {
    return NextResponse.json({ ok: false, message: "الباقة غير موجودة أو غير صالحة." }, { status: 422 });
  }

  /* التحقق البسيط من صحة رقم العملية (أرقام فقط، 6-20 خانة) */
  if (!/^\d{6,20}$/.test(txNumber)) {
    return NextResponse.json(
      { ok: false, message: "رقم عملية شام كاش يجب أن يكون أرقاماً فقط من 6 إلى 20 خانة." },
      { status: 422 }
    );
  }

  /* التحقق من صحة رقم الهاتف (أرقام فقط، 7-15 خانة) */
  if (!/^\d{7,15}$/.test(phone)) {
    return NextResponse.json(
      { ok: false, message: "رقم الهاتف يجب أن يكون أرقاماً فقط من 7 إلى 15 خانة." },
      { status: 422 }
    );
  }

  /* منع تكرار رقم العملية (من أي مستخدم) — فريد على مستوى الجدول */
  const dup = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.transactionNumber, txNumber))
    .limit(1);
  if (dup.length) {
    return NextResponse.json(
      { ok: false, message: "رقم العملية مُستخدم مسبقاً — تأكد من الرقم الصحيح." },
      { status: 409 }
    );
  }

  const now = new Date();
  const expires = plan.unit === "month" ? new Date(now.getTime() + MONTH_DAYS * 864e5) : null;

  /* إدراج المعاملة + تفعيل المزايا فوراً — يُنفذان معاً ضمن معاملة HTTP واحدة */
  try {
    await db.batch([
      db.insert(transactions).values({
        userId: session.user.dbId,
        transactionNumber: txNumber,
        contactPhone: phone,
        planName: plan.id, /* معرّف داخلي مستقر — يعرض العميل الاسم من /lib/plans */
        status: "unverified",
        createdAt: now,
        updatedAt: now,
      }),
      db
        .update(users)
        .set({
          plan: plan.id,
          planExpiresAt: expires,
          paidOnce: plan.unit === "once" ? true : undefined,
          isSingleUsed: plan.id === "single" ? false : undefined,
        })
        .where(eq(users.id, session.user.dbId)),
    ]);
  } catch (err) {
    console.error("[checkout] فشل حفظ المعاملة:", err);
    return NextResponse.json(
      { ok: false, message: "تعذر حفظ الطلب — حاول مجدداً أو تواصل مع الدعم." },
      { status: 500 }
    );
  }

  await logEvent({
    action: "checkout_submitted",
    entity: "payment",
    entityId: "",
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `طلب شحن شام كاش رقم ${txNumber} — باقة ${plan.title} — تفعيل فوري تلقائي (unverified)`,
    meta: { plan: plan.id, txRef: txNumber, amount: plan.priceUsd },
  });

  return NextResponse.json({
    ok: true,
    message: `تم تفعيل باقة ${plan.title} فوراً — مزاياك الكاملة جاهزة الآن!`,
  });
}
