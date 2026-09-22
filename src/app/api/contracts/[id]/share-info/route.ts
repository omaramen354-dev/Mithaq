import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { shareUrlFor, verifyPathFor, contractVerification } from "@/lib/fingerprint";
import { buildOfficialShareMessage, whatsappLink } from "@/lib/whatsapp";
import { telegramConfigured } from "@/lib/telegram";

export const runtime = "nodejs";

/* ============================================================
   GET /api/contracts/[id]/share-info — بيانات المشاركة الرسمية
   ============================================================ */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.dbId)
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });

  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.shareToken, id), eq(contracts.ownerId, session.user.dbId)))
    .limit(1);
  const contract = rows[0];
  if (!contract)
    return NextResponse.json({ ok: false, message: "العقد غير موجود." }, { status: 404 });

  const base = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const link = shareUrlFor(contract.shareToken, base);
  const { ref } = contractVerification(
    contract.id,
    contract.updatedAt,
    contract.status
  );

  return NextResponse.json({
    ok: true,
    link,
    verifyLink: base + verifyPathFor(contract.shareToken),
    whatsappUrl: whatsappLink(buildOfficialShareMessage(contract, link)),
    fingerprint: contract.contentHash,
    telegramConfigured: telegramConfigured(),
  });
}
