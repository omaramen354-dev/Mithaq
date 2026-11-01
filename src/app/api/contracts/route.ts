import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  buildContractContent,
  clampText,
  clampClauses,
  isBodyTooLarge,
  CONTRACT_LIMITS,
} from "@/lib/contract-text";
import { CONTRACT_TYPES } from "@/lib/contract-types";
import { shareUrlFor } from "@/lib/fingerprint";
import { contractFingerprint } from "@/lib/contract-hash";
import { randomUUID } from "crypto";
import { logEvent } from "@/lib/logger";
import { PLAN_LIMITS } from "@/lib/plans";
import { parseParty2Email } from "@/lib/contract-schema";

export const runtime = "nodejs";

/* ============================================================
   /api/contracts — GET (قائمة عقود المستخدم) | POST (إنشاء عقد)

   Guest-First: الضيف يجرب بناء العقد في الواجهة كاملاً دون تسجيل.
   كل عمليات الكتابة هنا للمسجلين فقط (401 JSON لغير المسجلين).
   مسودة الضيف تُحفظ في قاعدة البيانات بعد الدخول عبر
   POST /api/contracts/restore (بجلسة صالحة) — انظر NewContractForm.
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

function validate(body: CreateBody): { ok: true; data: CreateBody } | { ok: false; message: string } {
  if (!body.type || !CONTRACT_TYPES[body.type])
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
  /* الحماية: الكتابة للمسجلين فقط — الضيف يمر عبر بوابة الواجهة */
  const session = await auth();
  if (!session?.user?.dbId) {
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });
  }

  /* ===== حد الباقة المجانية — منع الإساءة قبل أي معالجة =====
     المجاني: 3 عقود شهرياً. يُستثنى من الحد:
     - من اشترى باقة دفعة واحدة سابقاً (paidOnce)
     - صاحب باقة once فعّالة (single/basic/verified)
     - صاحب اشتراك شهري غير منتهٍ (freelancer/office) */
  {
    const uRows = await db
      .select({
        plan: users.plan,
        planExpiresAt: users.planExpiresAt,
        paidOnce: users.paidOnce,
      })
      .from(users)
      .where(eq(users.id, session.user.dbId))
      .limit(1);
    const u = uRows[0];
    const planId = u?.plan || "free";
    const expired = u?.planExpiresAt ? u.planExpiresAt.getTime() < Date.now() : false;
    const onceActive = planId === "single" || planId === "basic" || planId === "verified";
    const monthlyActive = (planId === "freelancer" || planId === "office") && !expired;
    /* ===== تطبيق حدود الباقات (PLAN_LIMITS) =====
       - بلا حد: موثّق، عقد واحد، من دفع سابقاً (paidOnce)،
         أو اشتراك شهري حي (مستقل/مكاتب) — غير محدود فعلاً
       - بحد شهري: المجاني 3، وأساسي 7 (دفعة واحدة تُحتسب شهرياً) */
    const unlimited =
      planId === "verified" ||
      planId === "single" ||
      Boolean(u?.paidOnce) ||
      monthlyActive;

    if (!unlimited) {
      const effectivePlan = planId === "basic" ? "basic" : "free";
      const limit = PLAN_LIMITS[effectivePlan] ?? PLAN_LIMITS.free ?? 3;
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const usedRows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(contracts)
        .where(
          and(eq(contracts.ownerId, session.user.dbId), sql`${contracts.createdAt} >= ${monthStart}`)
        );
      if ((usedRows[0]?.n || 0) >= limit) {
        const msg =
          effectivePlan === "basic"
            ? `وصلت حد باقة أساسي (${limit} عقود شهرياً) — ترقَّ لباقة موثّق لإنشاء عقود غير محدودة.`
            : `وصلت حد الباقة المجانية (${limit} عقود شهرياً) — ترقَّ لباقة موثّق لإنشاء عقود غير محدودة.`;
        return NextResponse.json(
          {
            ok: false,
            message: msg,
            upgrade: true,
          },
          { status: 402 }
        );
      }
    }
  }

  if (isBodyTooLarge(req))
    return NextResponse.json(
      { ok: false, message: "حجم الطلب كبير جداً — اختصر النصوص والبنود." },
      { status: 413 }
    );

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  const v = validate(body);
  if (!v.ok) return NextResponse.json({ ok: false, message: v.message }, { status: 422 });

  const d = v.data;
  const clauses = clampClauses(d.clauses);
  const now = new Date();

  const contract = {
    /* نولّد UUID هنا حتى تكون البصمة ثابتة قبل وبعد الإدخال */
    id: randomUUID(),
    ownerId: session.user.dbId,
    type: d.type!,
    status: "draft" as const,
    signingMode: d.signingMode === "quick" ? "quick" : "send",
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
  });

  const inserted = await db.insert(contracts).values(contract).returning();
  const row = inserted[0];

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

  return NextResponse.json(
    {
      ok: true,
      contract: row,
      shareUrl: shareUrlFor(row.shareToken, req.nextUrl.origin),
    },
    { status: 201 }
  );
}
