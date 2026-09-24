import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guestPromptSeen } from "@/db/schema";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

/* ============================================================
   /api/guest-prompt — سجل بصمة IP للضيوف لعرض تذكير التسجيل مرة
   واحدة لكل زائر (لا يعيد الكرة بعد إنشاء أول عقد ضيف).

   GET  → { showPrompt: boolean } هل نعرض نافذة التسجيل لهذا الزائر؟
   POST → تسجيل/تحديث بصمة الزائر بعد عرض النافذة أو حفظ مسودة ضيف
   ============================================================ */

/** استخراج IP الزائر من ترويسات البروكسي (Vercel/Cloudflare) */
function guestIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

/** بصمة مجهولة: SHA-256(ip + salt) — لا نخزن الـ IP الخام (خصوصية) */
function ipHashOf(ip: string): string {
  const salt = process.env.AUTH_SECRET || "mithaq-salt";
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  /* المسجل لا يحتاج تذكير أصلاً */
  if (session?.user?.dbId)
    return NextResponse.json({ ok: true, showPrompt: false });

  try {
    const rows = await db
      .select({ id: guestPromptSeen.id })
      .from(guestPromptSeen)
      .where(eq(guestPromptSeen.ipHash, ipHashOf(guestIp(req))))
      .limit(1);
    return NextResponse.json({ ok: true, showPrompt: rows.length === 0 });
  } catch (e) {
    console.error("guest-prompt GET failed:", e);
    /* عند فشل الوصول للقاعدة نتجنب إزعاج الزائر بالتكرار */
    return NextResponse.json({ ok: true, showPrompt: false });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.dbId)
    return NextResponse.json({ ok: true, recorded: false });

  try {
    const ua = (req.headers.get("user-agent") || "").slice(0, 300);
    const hash = ipHashOf(guestIp(req));

    /* تسجيل/تحديث البصمة — عدّاد ذري لعدد مسودات الضيف المحفوظة */
    await db
      .insert(guestPromptSeen)
      .values({ ipHash: hash, userAgent: ua })
      .onConflictDoUpdate({
        target: guestPromptSeen.ipHash,
        set: {
          draftsSaved: sql`${guestPromptSeen.draftsSaved} + 1`,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true, recorded: true });
  } catch (e) {
    console.error("guest-prompt POST failed:", e);
    /* فشل التسجيل لا يعطل تدفق الضيف */
    return NextResponse.json({ ok: true, recorded: false });
  }
}
