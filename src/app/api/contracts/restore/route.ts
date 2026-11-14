import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  buildContractContent,
  clampText,
  clampClauses,
  readBoundedJson,
  CONTRACT_LIMITS,
} from "@/lib/contract-text";
import { CONTRACT_TYPES, isValidContractType } from "@/lib/contract-types";
import { shareUrlFor } from "@/lib/fingerprint";
import { parseParty2Email } from "@/lib/contract-schema";
import { contractFingerprint } from "@/lib/contract-hash";
import { checkContractCreationAccess } from "@/lib/mithaq-guard";
import { logEvent } from "@/lib/logger";
import { noStoreJson } from "@/lib/client-ip";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/* ============================================================
   POST /api/contracts/restore — حفظ مسودة الضيف بعد تسجيل الدخول
   - يطبّق نفس حارس التجميد وحدود الباقات (لا يمكن تجاوز الحد عبر restore)
   - لا يستحوذ على عقود يتيمة مجهولة الهوية في قاعدة البيانات
   - يبني نص العقد وبصمته SHA-256 كاملة ويسجّل الحدث في activity_logs
   ============================================================ */

type RestoreBody = {
  type?: string;
  party1?: string;
  party2?: string;
  party2Email?: string;
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
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  }

  /* نفس حارس الإنشاء: منع المجمّد + تطبيق حدود الباقة المجانية / العقد الواحد / الأساسي */
  const access = await checkContractCreationAccess(session.user.dbId);
  if (!access.allowed) {
    return noStoreJson(
      {
        ok: false,
        code: access.code,
        message: access.message,
        upgrade: access.status === 402,
      },
      { status: access.status }
    );
  }

  const parsed = await readBoundedJson<RestoreBody>(req, CONTRACT_LIMITS.maxBodyBytes);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const body = parsed.data;

  if (!isValidContractType(body.type))
    return noStoreJson({ ok: false, message: "نوع العقد غير صحيح." }, { status: 422 });
  if (
    !clampText(body.party1, CONTRACT_LIMITS.partyName) ||
    !clampText(body.party2, CONTRACT_LIMITS.partyName)
  )
    return noStoreJson({ ok: false, message: "بيانات الأطراف ناقصة." }, { status: 422 });

  const clauses = clampClauses(body.clauses);
  const now = new Date();
  const signingMode = body.signingMode === "quick" ? "quick" : "send";

  /* حجز البريد: إجباري في وضع الإرسال عبر الرابط — اختياري في السريع */
  const parsedParty2Email = parseParty2Email(body.party2Email, {
    required: signingMode !== "quick",
  });
  if (!parsedParty2Email.ok) {
    return noStoreJson({ ok: false, message: parsedParty2Email.message }, { status: 422 });
  }

  /* إنشاء عقد جديد مملوك للمستخدم مع كامل النص والبصمة */
  const contract = {
    id: randomUUID(),
    ownerId: session.user.dbId,
    type: body.type,
    status: "draft" as const,
    signingMode,
    party1Name: clampText(body.party1, CONTRACT_LIMITS.partyName),
    party2Name: clampText(body.party2, CONTRACT_LIMITS.partyName),
    party2Email: parsedParty2Email.email || null,
    amount: clampText(body.amount, CONTRACT_LIMITS.amount),
    city: clampText(body.city, CONTRACT_LIMITS.city),
    country: clampText(body.country, CONTRACT_LIMITS.country),
    subject: clampText(body.subject, CONTRACT_LIMITS.subject),
    duration: clampText(body.duration, CONTRACT_LIMITS.duration),
    paymentMethod: clampText(body.paymentMethod, CONTRACT_LIMITS.paymentMethod),
    notes: clampText(body.notes, CONTRACT_LIMITS.notes),
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
    signingMode: contract.signingMode,
    party2Email: contract.party2Email,
    status: contract.status,
  });

  const inserted = await db.insert(contracts).values(contract).returning();
  const row = inserted[0];

  if (access.consumeSingle) {
    await db
      .update(users)
      .set({ isSingleUsed: true })
      .where(eq(users.id, session.user.dbId));
  }

  await logEvent({
    action: "contract_restored",
    entity: "contract",
    entityId: row.id,
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `استعادة مسودة عقد ${CONTRACT_TYPES[body.type] || body.type} — ${row.party1Name} ↔ ${row.party2Name}`,
    meta: { type: body.type, signingMode: row.signingMode },
  });

  return noStoreJson(
    {
      ok: true,
      contract: row,
      shareUrl: shareUrlFor(row.shareToken, new URL(req.url).origin),
    },
    { status: 201 }
  );
}
