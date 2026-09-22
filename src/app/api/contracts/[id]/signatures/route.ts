import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, signatureEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalize, buildContractContent } from "@/lib/contract-text";
import { contractFingerprint, verifyPathFor } from "@/lib/fingerprint";
import { contractTypeName } from "@/lib/contract-types";
import { notifyContractEvent } from "@/lib/telegram";
import { shareUrlFor } from "@/lib/fingerprint";

export const runtime = "nodejs";

/* ============================================================
   POST /api/contracts/[id]/signatures
   id = shareToken (المعرّف العام)
   - party2: عام (من صفحة /share عبر الرابط) — هذا المسار الذي
     يستقبل توقيع الطرف الثاني من جهازه — بلا أي لوحة على جهاز
     صاحب العقد.
   - party1: يتطلب جلسة صاحب العقد.
   عند الحفظ: تحديث الحالة في Neon + سجل إثبات + إشعار تيليجرام
   ============================================================ */

type SignBody = {
  party?: string;
  name?: string;
  signatureData?: string;
};

function requestMeta(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown";
  return {
    ipAddress: ip,
    userAgent: req.headers.get("user-agent") || "unknown",
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: SignBody;
  try {
    body = (await req.json()) as SignBody;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  const party = body.party === "party2" ? "party2" : "party1";
  const dataUrl = normalize(body.signatureData || "");
  if (!dataUrl.startsWith("data:image/png;base64,"))
    return NextResponse.json({ ok: false, message: "التوقيع غير صحيح." }, { status: 422 });

  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.shareToken, id))
    .limit(1);
  const contract = rows[0];
  if (!contract)
    return NextResponse.json({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  /* الطرف الأول يوقّع فقط من حساب صاحب العقد؛ الطرف الثاني عبر الرابط العام */
  if (party === "party1") {
    const session = await auth();
    if (!session?.user?.dbId || contract.ownerId !== session.user.dbId) {
      return NextResponse.json(
        { ok: false, message: "توقيع الطرف الأول يتطلب تسجيل دخول صاحب العقد." },
        { status: 401 }
      );
    }
  }

  if (contract.status === "signed")
    return NextResponse.json({ ok: false, message: "العقد موقّع بالكامل." }, { status: 409 });

  /* منع توقيع نفس الطرف مرتين */
  const alreadySigned = party === "party1" ? contract.sig1SignedAt : contract.sig2SignedAt;
  if (alreadySigned)
    return NextResponse.json({ ok: false, message: "هذا الطرف وقّع مسبقاً." }, { status: 409 });

  const meta = requestMeta(req);
  const now = new Date();
  const signerName =
    normalize(body.name) || (party === "party1" ? contract.party1Name : contract.party2Name);

  const updated = await db
    .update(contracts)
    .set({
      ...(party === "party1"
        ? { sig1DataUrl: dataUrl, sig1Name: signerName, sig1SignedAt: now }
        : { sig2DataUrl: dataUrl, sig2Name: signerName, sig2SignedAt: now }),
      status:
        (party === "party1" ? contract.sig2SignedAt : contract.sig1SignedAt)
          ? "signed"
          : "partially_signed",
      updatedAt: now,
    })
    .where(eq(contracts.id, contract.id))
    .returning();

  /* سجل الإثبات: IP + جهاز + وقت */
  await db.insert(signatureEvents).values({
    contractId: contract.id,
    party,
    signerName,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    signedAt: now,
  });

  /* إعادة ختم النص والبصمة بعد التوقيع */
  const fresh = updated[0];
  const content = buildContractContent({
    type: fresh.type,
    party1Name: fresh.party1Name,
    party2Name: fresh.party2Name,
    amount: fresh.amount,
    city: fresh.city,
    subject: fresh.subject,
    duration: fresh.duration,
    paymentMethod: fresh.paymentMethod,
    notes: fresh.notes,
    clauses: fresh.clauses,
    date: fresh.createdAt,
    sig1Name: fresh.sig1Name,
    sig2Name: fresh.sig2Name,
  });
  const contentHash = contractFingerprint({
    id: fresh.id,
    type: fresh.type,
    party1Name: fresh.party1Name,
    party2Name: fresh.party2Name,
    amount: fresh.amount,
    date: fresh.createdAt,
    duration: fresh.duration,
    paymentMethod: fresh.paymentMethod,
    city: fresh.city,
    subject: fresh.subject,
    notes: fresh.notes,
    clauses: fresh.clauses,
    content,
  });
  await db
    .update(contracts)
    .set({ content, contentHash, updatedAt: new Date() })
    .where(eq(contracts.id, contract.id));

  /* إشعار تيليجرام (لا يفشل الطلب إذا فشل الإشعار) */
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  notifyContractEvent(
    {
      typeName: contractTypeName(fresh.type),
      ref: "",
      party1Name: fresh.party1Name,
      party2Name: fresh.party2Name,
      shareUrl: shareUrlFor(fresh.shareToken, base),
      verifyUrl: base + verifyPathFor(fresh.shareToken),
    },
    fresh.status === "signed" ? "signed" : "signing",
    { name: signerName, party: party === "party1" ? "الطرف الأول" : "الطرف الثاني" }
  ).catch(() => {});

  return NextResponse.json({ ok: true, contract: { ...fresh, content, contentHash } });
}
