import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  buildContractContent,
  clampText,
  clampClauses,
  isBodyTooLarge,
  CONTRACT_LIMITS,
} from "@/lib/contract-text";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import { parseParty2Email } from "@/lib/contract-schema";
import { contractFingerprint } from "@/lib/contract-hash";
import { decodeShareToken } from "@/lib/share-token";

export const runtime = "nodejs";

/* ============================================================
   /api/contracts/[id] — GET | PUT (تعديل) | DELETE
   id هنا = shareToken (المعرّف العام المستخدم في الروابط)
   ============================================================ */

async function findOwned(id: string, dbId: string) {
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.shareToken, id), eq(contracts.ownerId, dbId)))
    .limit(1);
  return rows[0] || null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);
  const session = await auth();
  if (!session?.user?.dbId)
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  const contract = await findOwned(id, session.user.dbId);
  if (!contract)
    return NextResponse.json({ ok: false, message: "العقد غير موجود." }, { status: 404 });
  return NextResponse.json({ ok: true, contract });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);
  const session = await auth();
  if (!session?.user?.dbId)
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  const existing = await findOwned(id, session.user.dbId);
  if (!existing)
    return NextResponse.json({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  /* لا تعديل بعد التوقيع — سلامة الوثيقة */
  if (existing.status === "signed")
    return NextResponse.json(
      { ok: false, message: "لا يمكن تعديل عقد موقّع من الطرفين." },
      { status: 409 }
    );

  if (isBodyTooLarge(req))
    return NextResponse.json(
      { ok: false, message: "حجم الطلب كبير جداً — اختصر النصوص والبنود." },
      { status: 413 }
    );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  /* نوع العقد يجب أن يبقى ضمن الأنواع المعروفة */
  const nextType =
    typeof body.type === "string" && CONTRACT_TYPES[body.type]
      ? body.type
      : existing.type;

  const nextSigningMode =
    body.signingMode === "quick" || body.signingMode === "send"
      ? body.signingMode
      : existing.signingMode;

  /* وضع الإرسال عبر الرابط يتطلب بريداً محجوزاً — وإلا صار أي حساب
     Google قادراً على التوقيع كطرف ثانٍ. */
  const emailResult = parseParty2Email(
    body.party2Email !== undefined ? body.party2Email : existing.party2Email,
    { required: nextSigningMode !== "quick" }
  );
  if (!emailResult.ok)
    return NextResponse.json(
      { ok: false, message: emailResult.message },
      { status: 422 }
    );

  const merged = {
    type: nextType,
    party1Name:
      clampText(body.party1, CONTRACT_LIMITS.partyName) || existing.party1Name,
    party2Name:
      clampText(body.party2, CONTRACT_LIMITS.partyName) || existing.party2Name,
    party2Email: emailResult.email || null,
    amount:
      body.amount !== undefined
        ? clampText(body.amount, CONTRACT_LIMITS.amount)
        : existing.amount,
    city:
      body.city !== undefined
        ? clampText(body.city, CONTRACT_LIMITS.city)
        : existing.city,
    country:
      body.country !== undefined
        ? clampText(body.country, CONTRACT_LIMITS.country)
        : existing.country,
    subject:
      body.subject !== undefined
        ? clampText(body.subject, CONTRACT_LIMITS.subject)
        : existing.subject,
    duration:
      body.duration !== undefined
        ? clampText(body.duration, CONTRACT_LIMITS.duration)
        : existing.duration,
    paymentMethod:
      body.paymentMethod !== undefined
        ? clampText(body.paymentMethod, CONTRACT_LIMITS.paymentMethod)
        : existing.paymentMethod,
    notes:
      body.notes !== undefined
        ? clampText(body.notes, CONTRACT_LIMITS.notes)
        : existing.notes,
    clauses:
      body.clauses !== undefined
        ? clampClauses(body.clauses)
        : existing.clauses,
  };

  const content = buildContractContent({
    ...merged,
    date: existing.createdAt,
    sig1Name: existing.sig1Name,
    sig2Name: existing.sig2Name,
  });
  const contentHash = contractFingerprint({
    id: existing.id,
    type: merged.type,
    party1Name: merged.party1Name,
    party2Name: merged.party2Name,
    amount: merged.amount,
    date: existing.createdAt,
    duration: merged.duration,
    paymentMethod: merged.paymentMethod,
    city: merged.city,
    subject: merged.subject,
    notes: merged.notes,
    clauses: merged.clauses,
    content,
  });

  const updated = await db
    .update(contracts)
    .set({
      ...merged,
      signingMode: nextSigningMode,
      content,
      contentHash,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, existing.id))
    .returning();

  return NextResponse.json({ ok: true, contract: updated[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);
  const session = await auth();
  if (!session?.user?.dbId)
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  const existing = await findOwned(id, session.user.dbId);
  if (!existing)
    return NextResponse.json({ ok: false, message: "العقد غير موجود." }, { status: 404 });
  await db.delete(contracts).where(eq(contracts.id, existing.id));
  return NextResponse.json({ ok: true, message: "تم حذف العقد بنجاح." });
}
