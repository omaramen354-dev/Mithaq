import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { contractFingerprint } from "@/lib/fingerprint";

export const runtime = "nodejs";

/* ============================================================
   GET /api/verify/[id] — تحقق عام (بلا بيانات مالية حساسة)
   id = shareToken
   ============================================================ */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db
    .select({
      id: contracts.id,
      type: contracts.type,
      status: contracts.status,
      party1Name: contracts.party1Name,
      party2Name: contracts.party2Name,
      amount: contracts.amount,
      duration: contracts.duration,
      paymentMethod: contracts.paymentMethod,
      city: contracts.city,
      subject: contracts.subject,
      notes: contracts.notes,
      createdAt: contracts.createdAt,
      sig1SignedAt: contracts.sig1SignedAt,
      sig2SignedAt: contracts.sig2SignedAt,
      content: contracts.content,
      clauses: contracts.clauses,
      contentHash: contracts.contentHash,
    })
    .from(contracts)
    .where(eq(contracts.shareToken, id))
    .limit(1);

  const c = rows[0];
  if (!c)
    return NextResponse.json({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  const current = contractFingerprint({
    id: c.id,
    type: c.type,
    party1Name: c.party1Name,
    party2Name: c.party2Name,
    amount: c.amount,
    date: c.createdAt,
    duration: c.duration,
    paymentMethod: c.paymentMethod,
    city: c.city,
    subject: c.subject,
    notes: c.notes,
    clauses: c.clauses,
    content: c.content,
  });
  const matched = current === c.contentHash;

  return NextResponse.json({
    ok: true,
    found: true,
    matched,
    status: c.status,
    party1: c.party1Name,
    party2: c.party2Name,
    createdAt: c.createdAt,
    lastSignatureAt: c.sig2SignedAt || c.sig1SignedAt || null,
    fingerprint: c.contentHash,
  });
}
