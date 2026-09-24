import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { normalize, buildContractContent } from "@/lib/contract-text";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import { contractFingerprint, shareUrlFor } from "@/lib/fingerprint";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/* ============================================================
   POST /api/contracts/restore — استعادة مسودة الضيف بعد الدخول

   بعد نجاح تسجيل الدخول عبر Google، يرسل العميل المسودة المحفوظة
   في LocalStorage إلى هذا المسار، ونبحث عن مسودة ضيف مطابقة
   (ownerId فارغ + نفس party1 + party2) نُشئت خلال آخر 24 ساعة،
   فنُلحقها بحسابه بدل تكرارها. إن لم نجد مطابقاً ننشئ عقداً جديداً
   مملوكاً له مباشرة. ثم نمسح المسودة المحلية ونعيد للوحة.
   ============================================================ */

type RestoreBody = {
  type?: string;
  party1?: string;
  party2?: string;
  amount?: string;
  city?: string;
  country?: string;
  subject?: string;
  duration?: string;
  paymentMethod?: string;
  signingMode?: string;
  notes?: string;
  clauses?: string[];
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  }

  let body: RestoreBody;
  try {
    body = (await req.json()) as RestoreBody;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  if (!body.type || !CONTRACT_TYPES[body.type])
    return NextResponse.json({ ok: false, message: "نوع العقد غير صحيح." }, { status: 422 });
  if (!normalize(body.party1) || !normalize(body.party2))
    return NextResponse.json({ ok: false, message: "بيانات الأطراف ناقصة." }, { status: 422 });

  const clauses = Array.isArray(body.clauses)
    ? body.clauses.map(normalize).filter(Boolean)
    : [];
  const now = new Date();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  /* البحث عن مسودة ضيف مطابقة أنشئت خلال آخر 24 ساعة */
  const matches = await db
    .select()
    .from(contracts)
    .where(
      and(
        isNull(contracts.ownerId),
        eq(contracts.party1Name, normalize(body.party1)),
        eq(contracts.party2Name, normalize(body.party2)),
        eq(contracts.type, body.type)
      )
    )
    .orderBy(desc(contracts.createdAt))
    .limit(5);

  const match = matches.find(
    (m) => m.createdAt >= since && m.status === "draft" && m.content === ""
  );

  if (match) {
    const updated = await db
      .update(contracts)
      .set({
        ownerId: session.user.dbId,
        amount: normalize(body.amount),
        city: normalize(body.city),
        country: normalize(body.country),
        subject: normalize(body.subject),
        duration: normalize(body.duration),
        paymentMethod: normalize(body.paymentMethod),
        notes: normalize(body.notes),
        clauses,
        signingMode: body.signingMode === "quick" ? "quick" : "send",
        updatedAt: now,
      })
      .where(eq(contracts.id, match.id))
      .returning();

    return NextResponse.json({ ok: true, contract: updated[0], shareUrl: shareUrlFor(updated[0].shareToken) });
  }

  /* لا مطابق — إنشاء عقد جديد مملوك للمستخدم مباشرة */
  const contract = {
    id: randomUUID(),
    ownerId: session.user.dbId,
    type: body.type,
    status: "draft" as const,
    signingMode: body.signingMode === "quick" ? "quick" : "send",
    party1Name: normalize(body.party1),
    party2Name: normalize(body.party2),
    amount: normalize(body.amount),
    city: normalize(body.city),
    country: normalize(body.country),
    subject: normalize(body.subject),
    duration: normalize(body.duration),
    paymentMethod: normalize(body.paymentMethod),
    notes: normalize(body.notes),
    clauses,
    content: "",
    contentHash: "",
    shareToken: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  contract.content = buildContractContent({
    ...contract,
    date: now,
    clauses: contract.clauses.length ? contract.clauses : undefined,
  });
  contract.contentHash = contractFingerprint({
    id: contract.id,
    type: contract.type,
    party1Name: contract.party1Name,
    party2Name: contract.party2Name,
    amount: contract.amount,
    date: now,
    duration: contract.duration,
    paymentMethod: contract.paymentMethod,
    city: contract.city,
    subject: contract.subject,
    notes: contract.notes,
    clauses: contract.clauses,
    content: contract.content,
  });

  const inserted = await db.insert(contracts).values(contract).returning();
  const row = inserted[0];

  return NextResponse.json(
    { ok: true, contract: row, shareUrl: shareUrlFor(row.shareToken) },
    { status: 201 }
  );
}
