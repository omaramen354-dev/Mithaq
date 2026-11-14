import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, signatureEvents } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { normalize, buildContractContent, readBoundedJson } from "@/lib/contract-text";
import { verifyPathFor, shareUrlFor, contractVerification } from "@/lib/fingerprint";
import { contractFingerprint } from "@/lib/contract-hash";
import { contractTypeName } from "@/lib/contract-types";
import { validatePngDataUrl } from "@/lib/contract-schema";
import { isOwnerSuspended } from "@/lib/mithaq-guard";
import { notifyContractEvent } from "@/lib/telegram";
import { logEvent } from "@/lib/logger";
import { decodeShareToken } from "@/lib/share-token";
import { extractClientIp, noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   POST /api/contracts/[id]/signatures
   - تحقق ثنائي صارم لصورة التوقيع PNG (Magic Bytes + IHDR)
   - تحديث شرطي ذري يمنع سباق التوقيع المتزامن (TOCTOU)
   - ختم البصمة SHA-256 شاملةً صور التوقيع والهويات وأوقاتها
   - استخراج IP موثوق غير قابل للتزوير عبر X-Forwarded-For
   ============================================================ */

type SignBody = {
  party?: string;
  name?: string;
  signatureData?: string;
};

const MAX_SIGNATURE_CHARS = 200_000;
const MAX_SIGN_BODY_BYTES = 260_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);

  const parsed = await readBoundedJson<SignBody>(req, MAX_SIGN_BODY_BYTES);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const body = parsed.data;

  const party = body.party === "party2" ? "party2" : "party1";

  /* تحقق ثنائي صارم من أن التوقيع صورة PNG حقيقية ضمن حدود الحجم والأبعاد */
  const sigCheck = validatePngDataUrl(body.signatureData, MAX_SIGNATURE_CHARS);
  if (!sigCheck.ok) {
    const tooBig =
      typeof body.signatureData === "string" &&
      body.signatureData.length > MAX_SIGNATURE_CHARS;
    return noStoreJson(
      { ok: false, message: sigCheck.message },
      { status: tooBig ? 413 : 422 }
    );
  }
  const dataUrl = sigCheck.value;

  /* التحقق من الجلسة قبل أي استعلام قاعدة بيانات (يمنع استنزاف القاعدة من طلبات غير مصدّقة) */
  const session = await auth();
  const viewerDbId = session?.user?.dbId || null;
  const viewerGoogleId = session?.user?.id || null;
  const viewerEmail = (session?.user?.email || "").toLowerCase().trim() || null;

  if (party === "party1" && !viewerDbId) {
    return noStoreJson(
      { ok: false, message: "توقيع الطرف الأول يتطلب تسجيل دخول صاحب العقد." },
      { status: 401 }
    );
  }
  if (party === "party2" && (!viewerDbId || !viewerEmail)) {
    return noStoreJson(
      {
        ok: false,
        message: "توقيع الطرف الثاني يتطلب تسجيل الدخول بحساب Google الخاص به.",
      },
      { status: 401 }
    );
  }

  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.shareToken, id))
    .limit(1);
  const contract = rows[0];
  if (!contract)
    return noStoreJson({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  /* حجب التوقيع على عقود الحسابات المجمّدة مالياً */
  const guard = await isOwnerSuspended(contract.id);
  if (guard.suspended) {
    return noStoreJson(
      { ok: false, message: "هذا العقد مجمّد مؤقتاً ولا يمكن التوقيع عليه حالياً." },
      { status: 403 }
    );
  }

  /* ===== التحقق من هوية المُوقِّع — منع انتحال الطرف الثاني ===== */
  if (party === "party1") {
    if (contract.ownerId !== viewerDbId) {
      return noStoreJson(
        { ok: false, message: "توقيع الطرف الأول يتطلب تسجيل دخول صاحب العقد." },
        { status: 401 }
      );
    }
  } else {
    if (contract.ownerId && contract.ownerId === viewerDbId) {
      return noStoreJson(
        {
          ok: false,
          message:
            "صاحب العقد لا يوقّع نيابة عن الطرف الثاني — شارك الرابط مع الطرف الثاني ليفتحه بحسابه.",
        },
        { status: 403 }
      );
    }
    /* مطابقة صارمة: البريد المحجوز في صلب العقد يجب أن يطابق بريد الجلسة */
    const bound = (contract.party2Email || "").toLowerCase().trim() || null;
    if (contract.signingMode !== "quick" && !bound) {
      return noStoreJson(
        {
          ok: false,
          message: "هذا العقد لا يملك بريداً محجوزاً للطرف الثاني.",
        },
        { status: 403 }
      );
    }
    if (bound && bound !== viewerEmail) {
      return noStoreJson(
        {
          ok: false,
          message:
            "عذراً، هذا الرابط مخصص للتوثيق بحساب Google محدد مسبقاً من قِبل صاحب العقد، يرجى التبديل للحساب الصحيح",
        },
        { status: 403 }
      );
    }
  }

  if (contract.status === "signed")
    return noStoreJson({ ok: false, message: "العقد موقّع بالكامل." }, { status: 409 });

  const alreadySigned = party === "party1" ? contract.sig1SignedAt : contract.sig2SignedAt;
  if (alreadySigned)
    return noStoreJson({ ok: false, message: "هذا الطرف وقّع مسبقاً." }, { status: 409 });

  const ipAddress = extractClientIp(req.headers);
  const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 300);
  const now = new Date();
  const signerName =
    normalize(body.name).slice(0, 120) ||
    (party === "party1" ? contract.party1Name : contract.party2Name);

  /* تحديث شرطي ذري: لا يُكتب التوقيع إلا إذا كان الحقل المقابل NULL لمنع التكرار والسباق */
  const updated = await db
    .update(contracts)
    .set(
      party === "party1"
        ? { sig1DataUrl: dataUrl, sig1Name: signerName, sig1SignedAt: now, updatedAt: now }
        : {
            sig2DataUrl: dataUrl,
            sig2Name: signerName,
            sig2SignedAt: now,
            party2Email: viewerEmail,
            party2GoogleId: viewerGoogleId,
            updatedAt: now,
          }
    )
    .where(
      and(
        eq(contracts.id, contract.id),
        party === "party1" ? isNull(contracts.sig1SignedAt) : isNull(contracts.sig2SignedAt)
      )
    )
    .returning();

  if (!updated[0]) {
    return noStoreJson({ ok: false, message: "هذا الطرف وقّع مسبقاً." }, { status: 409 });
  }

  /* سجل الإثبات: IP موثوق + جهاز + وقت */
  try {
    await db.insert(signatureEvents).values({
      contractId: contract.id,
      party,
      signerName,
      signerEmail: viewerEmail,
      ipAddress,
      userAgent,
      signedAt: now,
    });
  } catch {
    /* التوقيع نفسه محفوظ */
  }

  /* إعادة قراءة أحدث حالة للعقد لحسم الحالة النهائية والبصمة بدون أي سباق TOCTOU */
  const otherSigCol = party === "party1" ? contracts.sig2SignedAt : contracts.sig1SignedAt;
  const buildFinalFields = (row: typeof updated[number]) => {
    const status = row.sig1SignedAt && row.sig2SignedAt ? "signed" : "partially_signed";
    const content = buildContractContent({
      type: row.type,
      party1Name: row.party1Name,
      party2Name: row.party2Name,
      amount: row.amount,
      city: row.city,
      subject: row.subject,
      duration: row.duration,
      paymentMethod: row.paymentMethod,
      notes: row.notes,
      clauses: row.clauses,
      date: row.createdAt,
      sig1Name: row.sig1Name,
      sig2Name: row.sig2Name,
    });
    const contentHash = contractFingerprint({
      id: row.id,
      type: row.type,
      party1Name: row.party1Name,
      party2Name: row.party2Name,
      amount: row.amount,
      date: row.createdAt,
      duration: row.duration,
      paymentMethod: row.paymentMethod,
      city: row.city,
      subject: row.subject,
      notes: row.notes,
      clauses: row.clauses,
      content,
      signingMode: row.signingMode,
      party2Email: row.party2Email,
      party2GoogleId: row.party2GoogleId,
      status,
      sig1Name: row.sig1Name,
      sig1DataUrl: row.sig1DataUrl,
      sig1SignedAt: row.sig1SignedAt,
      sig2Name: row.sig2Name,
      sig2DataUrl: row.sig2DataUrl,
      sig2SignedAt: row.sig2SignedAt,
    });
    return { status, content, contentHash };
  };

  const [latestRow] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, contract.id))
    .limit(1);
  let fresh = latestRow || updated[0];
  let computed = buildFinalFields(fresh);

  /* تحديث محمي ضد تراجع الحالة: إذا كنا نكتب partially_signed لا نُعدّل الصف إلا إذا كان الطرف الآخر لم يوقّع بعد */
  let [finalRow] = await db
    .update(contracts)
    .set({
      status: computed.status,
      content: computed.content,
      contentHash: computed.contentHash,
      updatedAt: new Date(),
    })
    .where(
      computed.status === "signed"
        ? eq(contracts.id, contract.id)
        : and(eq(contracts.id, contract.id), isNull(otherSigCol))
    )
    .returning();

  /* إذا وقّع الطرف الآخر في نفس اللحظة، نعيد القراءة ونختم الحالة النهائية signed ببصمة موحّدة */
  if (!finalRow) {
    const [afterRace] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contract.id))
      .limit(1);
    if (afterRace) {
      fresh = afterRace;
      computed = buildFinalFields(fresh);
      const [reFinal] = await db
        .update(contracts)
        .set({
          status: computed.status,
          content: computed.content,
          contentHash: computed.contentHash,
          updatedAt: new Date(),
        })
        .where(eq(contracts.id, contract.id))
        .returning();
      finalRow = reFinal;
    }
  }

  const nextStatus = computed.status;
  const saved = finalRow || { ...fresh, ...computed };

  await logEvent({
    action: nextStatus === "signed" ? "contract_signed" : "contract_partially_signed",
    entity: "contract",
    entityId: saved.id,
    actorName: signerName,
    detail: `${party === "party1" ? "الطرف الأول" : "الطرف الثاني"} وقّع عقد ${contractTypeName(saved.type)} — ${saved.party1Name} ↔ ${saved.party2Name}`,
    meta: { party, ip: ipAddress },
  });

  const base = req.nextUrl.origin.replace(/\/+$/, "");
  const { ref } = contractVerification(saved.id, saved.updatedAt, saved.status);
  notifyContractEvent(
    {
      typeName: contractTypeName(saved.type),
      ref,
      party1Name: saved.party1Name,
      party2Name: saved.party2Name,
      shareUrl: shareUrlFor(saved.shareToken, base),
      verifyUrl: base + verifyPathFor(saved.shareToken),
    },
    nextStatus === "signed" ? "signed" : "signing",
    { name: signerName, party: party === "party1" ? "الطرف الأول" : "الطرف الثاني" }
  ).catch(() => {});

  return noStoreJson({ ok: true, contract: saved });
}
