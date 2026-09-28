import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { findPlan } from "@/lib/plans";

export const runtime = "nodejs";

/* ============================================================
   POST /api/payment-requests — إنشاء طلب دفع (تأكيد يدوي)
   للمسجلين فقط. يتحقق من صحة الباقة وطريقة الدفع والإثبات،
   ويمنع تكرار طلب معلّق على نفس الباقة. الطلب يدخل بحالة
   pending ويُفعَّل بعد تأكيد المشرف من /admin.
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
    return NextResponse.json(
      { ok: false, message: "سجّل الدخول أولاً حتى يُربط الطلب بحسابك." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  const plan = findPlan(body.plan || "");
  if (!plan || plan.id === "free") {
    return NextResponse.json({ ok: false, message: "الباقة غير صحيحة." }, { status: 422 });
  }
  const method = body.method === "shamcash" ? "shamcash" : "usdt";
  const txRef = (body.txRef || "").trim();
  const senderName = (body.senderName || "").trim();

  if (txRef.length < 6) {
    return NextResponse.json(
      { ok: false, message: "أدخل رقم العملية/الإيصال كاملاً (6 أحرف على الأقل)." },
      { status: 422 }
    );
  }
  if (method === "shamcash" && senderName.length < 3) {
    return NextResponse.json(
      { ok: false, message: "أدخل اسم المُرسل على شام كاش." },
      { status: 422 }
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
    return NextResponse.json(
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
    contractId: body.contractId || null,
    plan: plan.id,
    amountUsd: String(plan.priceUsd),
    method,
    status: "pending",
    txRef: [txRef, senderName ? "الاسم: " + senderName : ""].filter(Boolean).join(" | "),
  });

  return NextResponse.json(
    {
      ok: true,
      message: "تم إرسال طلبك بنجاح — سيراجعه الفريق ويُفعّل باقتك قريباً.",
    },
    { status: 201 }
  );
}
