import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { normalize, buildContractContent } from "@/lib/contract-text";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import { contractFingerprint, shareUrlFor } from "@/lib/fingerprint";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/* ============================================================
   /api/contracts — GET (قائمة عقود المستخدم) | POST (إنشاء عقد)
   ============================================================ */

type CreateBody = {
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

function validate(body: CreateBody): { ok: true; data: CreateBody } | { ok: false; message: string } {
  if (!body.type || !CONTRACT_TYPES[body.type])
    return { ok: false, message: "نوع العقد غير صحيح." };
  if (!body.party1 || !normalize(body.party1))
    return { ok: false, message: "الطرف الأول مطلوب." };
  if (!body.party2 || !normalize(body.party2))
    return { ok: false, message: "الطرف الثاني مطلوب." };
  return { ok: true, data: body };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.ownerId, session.user.dbId))
    .orderBy(desc(contracts.createdAt));
  return NextResponse.json({ ok: true, contracts: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  const v = validate(body);
  if (!v.ok) return NextResponse.json({ ok: false, message: v.message }, { status: 422 });

  const d = v.data;
  const clauses = Array.isArray(d.clauses)
    ? d.clauses.map(normalize).filter(Boolean)
    : [];
  const now = new Date();

  const contract = {
    /* نولّد UUID هنا حتى تكون البصمة ثابتة قبل وبعد الإدخال */
    id: randomUUID(),
    ownerId: session.user.dbId,
    type: d.type!,
    status: "draft" as const,
    signingMode: d.signingMode === "quick" ? "quick" : "send",
    party1Name: normalize(d.party1),
    party2Name: normalize(d.party2),
    amount: normalize(d.amount),
    city: normalize(d.city),
    country: normalize(d.country),
    subject: normalize(d.subject),
    duration: normalize(d.duration),
    paymentMethod: normalize(d.paymentMethod),
    notes: normalize(d.notes),
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
    {
      ok: true,
      contract: row,
      shareUrl: shareUrlFor(row.shareToken),
    },
    { status: 201 }
  );
}
