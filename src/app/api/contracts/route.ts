import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  buildContractContent,
  clampText,
  clampClauses,
  readBoundedJson,
  CONTRACT_LIMITS,
} from "@/lib/contract-text";
import { CONTRACT_TYPES, isValidContractType } from "@/lib/contract-types";
import { shareUrlFor } from "@/lib/fingerprint";
import { contractFingerprint } from "@/lib/contract-hash";
import { randomUUID } from "crypto";
import { logEvent } from "@/lib/logger";
import { parseParty2Email } from "@/lib/contract-schema";
import { checkContractCreationAccess } from "@/lib/mithaq-guard";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   /api/contracts — GET (قائمة عقود المستخدم) | POST (إنشاء عقد)
   ============================================================ */

type CreateBody = {
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

function validate(
  body: CreateBody
): { ok: true; data: CreateBody } | { ok: false; message: string } {
  if (!isValidContractType(body.type))
    return { ok: false, message: "نوع العقد غير صحيح." };
  if (!clampText(body.party1, CONTRACT_LIMITS.partyName))
    return { ok: false, message: "الطرف الأول مطلوب." };
  if (!clampText(body.party2, CONTRACT_LIMITS.partyName))
    return { ok: false, message: "الطرف الثاني مطلوب." };
  /* بروتوكول الحجز المسبق: بريد الطرف الثاني إجباري في وضع الإرسال
     عبر الرابط (send)، واختياري في التوقيع السريع على نفس الجهاز (quick) */
  const p2 = parseParty2Email(body.party2Email, {
    required: body.signingMode !== "quick",
  });
  if (!p2.ok) return { ok: false, message: p2.message };
  return { ok: true, data: { ...body, party2Email: p2.email } };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId) {
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.ownerId, session.user.dbId))
    .orderBy(desc(contracts.createdAt));
  return noStoreJson({ ok: true, contracts: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  }

  /* حارس موحّد: منع المجمّد مالياً + حدود الباقات (free/single/basic/verified/monthly) */
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

  const parsed = await readBoundedJson<CreateBody>(req, CONTRACT_LIMITS.maxBodyBytes);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }

  const v = validate(parsed.data);
  if (!v.ok) return noStoreJson({ ok: false, message: v.message }, { status: 422 });

  const d = v.data;
  const clauses = clampClauses(d.clauses);
  const now = new Date();
  const signingMode = d.signingMode === "quick" ? "quick" : "send";

  const contract = {
    id: randomUUID(),
    ownerId: session.user.dbId,
    type: d.type!,
    status: "draft" as const,
    signingMode,
    party1Name: clampText(d.party1, CONTRACT_LIMITS.partyName),
    party2Name: clampText(d.party2, CONTRACT_LIMITS.partyName),
    party2Email: d.party2Email || null,
    amount: clampText(d.amount, CONTRACT_LIMITS.amount),
    city: clampText(d.city, CONTRACT_LIMITS.city),
    country: clampText(d.country, CONTRACT_LIMITS.country),
    subject: clampText(d.subject, CONTRACT_LIMITS.subject),
    duration: clampText(d.duration, CONTRACT_LIMITS.duration),
    paymentMethod: clampText(d.paymentMethod, CONTRACT_LIMITS.paymentMethod),
    notes: clampText(d.notes, CONTRACT_LIMITS.notes),
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

  /* إذا كان المستخدم على باقة العقد الواحد — وسم الباقة كمستهلكة فوراً */
  if (access.consumeSingle) {
    await db
      .update(users)
      .set({ isSingleUsed: true })
      .where(eq(users.id, session.user.dbId));
  }

  await logEvent({
    action: "contract_created",
    entity: "contract",
    entityId: row.id,
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `عقد ${CONTRACT_TYPES[d.type!] || d.type} — ${row.party1Name} ↔ ${row.party2Name}`,
    meta: { type: d.type, signingMode: row.signingMode },
  });

  return noStoreJson(
    {
      ok: true,
      contract: row,
      shareUrl: shareUrlFor(row.shareToken, req.nextUrl.origin),
    },
    { status: 201 }
  );
}
