import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalize, buildContractContent } from "@/lib/contract-text";
import { contractFingerprint } from "@/lib/fingerprint";

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
  const { id } = await params;
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
  const { id } = await params;
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  const merged = {
    type: (body.type as string) || existing.type,
    party1Name: normalize(body.party1) || existing.party1Name,
    party2Name: normalize(body.party2) || existing.party2Name,
    amount: body.amount !== undefined ? normalize(body.amount) : existing.amount,
    city: body.city !== undefined ? normalize(body.city) : existing.city,
    country: body.country !== undefined ? normalize(body.country) : existing.country,
    subject: body.subject !== undefined ? normalize(body.subject) : existing.subject,
    duration: body.duration !== undefined ? normalize(body.duration) : existing.duration,
    paymentMethod:
      body.paymentMethod !== undefined
        ? normalize(body.paymentMethod)
        : existing.paymentMethod,
    notes: body.notes !== undefined ? normalize(body.notes) : existing.notes,
    clauses: Array.isArray(body.clauses)
      ? (body.clauses as string[]).map(normalize).filter(Boolean)
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
      signingMode:
        body.signingMode === "quick" || body.signingMode === "send"
          ? body.signingMode
          : existing.signingMode,
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
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.dbId)
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  const existing = await findOwned(id, session.user.dbId);
  if (!existing)
    return NextResponse.json({ ok: false, message: "العقد غير موجود." }, { status: 404 });
  await db.delete(contracts).where(eq(contracts.id, existing.id));
  return NextResponse.json({ ok: true, message: "تم حذف العقد بنجاح." });
}
