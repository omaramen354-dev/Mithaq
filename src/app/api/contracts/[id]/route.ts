import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  buildContractContent,
  clampText,
  clampClauses,
  readBoundedJson,
  CONTRACT_LIMITS,
} from "@/lib/contract-text";
import { isValidContractType } from "@/lib/contract-types";
import { parseParty2Email } from "@/lib/contract-schema";
import { contractFingerprint } from "@/lib/contract-hash";
import { decodeShareToken } from "@/lib/share-token";
import { logEvent } from "@/lib/logger";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   /api/contracts/[id] — GET | PUT (تعديل) | DELETE
   id هنا = shareToken (المعرّف العام المستخدم في الروابط)
   سلامة الإثبات القانوني:
   - يُقفل التعديل والحذف بمجرد وجود أي توقيع (جزئي أو كامل)
     لمنع التلاعب بالبنود أو إتلاف سجل التوقيعات (Bait-and-Switch).
   ============================================================ */

async function findOwned(id: string, dbId: string) {
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.shareToken, id), eq(contracts.ownerId, dbId)))
    .limit(1);
  return rows[0] || null;
}

function isContractLocked(c: {
  status: string;
  sig1SignedAt: Date | null;
  sig2SignedAt: Date | null;
}): boolean {
  return c.status !== "draft" || Boolean(c.sig1SignedAt) || Boolean(c.sig2SignedAt);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);
  const session = await auth();
  if (!session?.user?.dbId)
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  const contract = await findOwned(id, session.user.dbId);
  if (!contract)
    return noStoreJson({ ok: false, message: "العقد غير موجود." }, { status: 404 });
  return noStoreJson({ ok: true, contract });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);
  const session = await auth();
  if (!session?.user?.dbId)
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  const existing = await findOwned(id, session.user.dbId);
  if (!existing)
    return noStoreJson({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  /* قفل كامل فور بدء التوقيع (جزئي أو كامل) لمنع تعديل البنود بعد توقيع أحد الطرفين */
  if (isContractLocked(existing))
    return noStoreJson(
      { ok: false, message: "لا يمكن تعديل العقد بعد توقيع أي طرف عليه." },
      { status: 409 }
    );

  const parsed = await readBoundedJson<Record<string, unknown>>(
    req,
    CONTRACT_LIMITS.maxBodyBytes
  );
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const body = parsed.data;

  /* نوع العقد يجب أن يبقى ضمن الأنواع المصرّح بها فقط (Object.hasOwn) */
  if (body.type !== undefined && !isValidContractType(body.type)) {
    return noStoreJson({ ok: false, message: "نوع العقد غير صحيح." }, { status: 422 });
  }
  const nextType = isValidContractType(body.type) ? body.type : existing.type;

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
    return noStoreJson({ ok: false, message: emailResult.message }, { status: 422 });

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
    signingMode: nextSigningMode,
    party2Email: merged.party2Email,
    status: existing.status,
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
    .where(and(eq(contracts.id, existing.id), eq(contracts.status, "draft")))
    .returning();

  if (!updated[0]) {
    return noStoreJson(
      { ok: false, message: "لا يمكن تعديل العقد بعد بدء التوقيع عليه." },
      { status: 409 }
    );
  }

  return noStoreJson({ ok: true, contract: updated[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);
  const session = await auth();
  if (!session?.user?.dbId)
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  const existing = await findOwned(id, session.user.dbId);
  if (!existing)
    return noStoreJson({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  /* حماية الأدلة القانونية: لا يُحذف أي عقد يحمل توقيعاً (جزئياً أو كاملاً) */
  if (isContractLocked(existing)) {
    return noStoreJson(
      { ok: false, message: "لا يمكن حذف عقد يحمل توقيعات موثّقة." },
      { status: 409 }
    );
  }

  await db
    .delete(contracts)
    .where(and(eq(contracts.id, existing.id), eq(contracts.status, "draft")));

  await logEvent({
    action: "contract_deleted",
    entity: "contract",
    entityId: existing.id,
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `حذف مسودة عقد — ${existing.party1Name} ↔ ${existing.party2Name}`,
  });

  return noStoreJson({ ok: true, message: "تم حذف العقد بنجاح." });
}
