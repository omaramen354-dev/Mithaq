import { NextRequest } from "next/server";
import { db } from "@/db";
import { contracts, signatureEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { contractFingerprint } from "@/lib/contract-hash";
import { decodeShareToken } from "@/lib/share-token";
import { maskEmail } from "@/lib/format";
import { isOwnerSuspended } from "@/lib/mithaq-guard";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   GET /api/verify/[id] — تحقق عام (بلا بيانات مالية حساسة)
   id = shareToken
   ============================================================ */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);
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
      sig1Name: contracts.sig1Name,
      sig1DataUrl: contracts.sig1DataUrl,
      sig1SignedAt: contracts.sig1SignedAt,
      sig2Name: contracts.sig2Name,
      sig2DataUrl: contracts.sig2DataUrl,
      sig2SignedAt: contracts.sig2SignedAt,
      signingMode: contracts.signingMode,
      party2Email: contracts.party2Email,
      party2GoogleId: contracts.party2GoogleId,
      content: contracts.content,
      clauses: contracts.clauses,
      contentHash: contracts.contentHash,
    })
    .from(contracts)
    .where(eq(contracts.shareToken, id))
    .limit(1);

  const c = rows[0];
  if (!c)
    return noStoreJson({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  /* نفس حاجز الصفحات العامة: عقد صاحبه مجمّد مالياً لا يُتحقق منه */
  const guard = await isOwnerSuspended(c.id);
  if (guard.suspended)
    return noStoreJson(
      { ok: false, message: "هذا العقد غير متاح للتحقق حالياً." },
      { status: 403 }
    );

  /* سجل الإثبات — البريد مموّه في الاستجابة العامة */
  const events = await db
    .select()
    .from(signatureEvents)
    .where(eq(signatureEvents.contractId, c.id))
    .orderBy(signatureEvents.signedAt);

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
    signingMode: c.signingMode,
    party2Email: c.party2Email,
    party2GoogleId: c.party2GoogleId,
    status: c.status,
    sig1Name: c.sig1Name,
    sig1DataUrl: c.sig1DataUrl,
    sig1SignedAt: c.sig1SignedAt,
    sig2Name: c.sig2Name,
    sig2DataUrl: c.sig2DataUrl,
    sig2SignedAt: c.sig2SignedAt,
  });
  const matched = Boolean(c.contentHash) && current === c.contentHash;

  return noStoreJson({
    ok: true,
    found: true,
    matched,
    status: c.status,
    signingMode: c.signingMode === "quick" ? "quick" : "send",
    party2EmailMasked: c.party2Email ? maskEmail(c.party2Email) : null,
    party1: c.party1Name,
    party2: c.party2Name,
    createdAt: c.createdAt,
    lastSignatureAt: c.sig2SignedAt || c.sig1SignedAt || null,
    fingerprint: c.contentHash,
    signatureLog: events.map((ev) => ({
      party: ev.party,
      signerName: ev.signerName,
      signerEmailMasked: ev.signerEmail ? maskEmail(ev.signerEmail) : null,
      signedAt: ev.signedAt,
    })),
  });
}
