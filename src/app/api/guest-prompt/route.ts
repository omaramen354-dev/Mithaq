import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guestPromptSeen } from "@/db/schema";
import { auth } from "@/lib/auth";
import { extractClientIp, noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   /api/guest-prompt — سجل بصمة IP للضيوف لعرض تذكير التسجيل مرة
   واحدة لكل زائر، مع ملح عشوائي غير ثابت وحد إغراق لحماية القاعدة.
   ============================================================ */

const EPHEMERAL_SALT = randomBytes(32).toString("hex");
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_IP = 10;
const RATE_MAX_GLOBAL = 15;
const postHits = new Map<string, number[]>();

function isFlooding(key: string, max: number): boolean {
  const now = Date.now();
  if (postHits.size > 5000) postHits.clear();
  const arr = (postHits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  postHits.set(key, arr);
  return arr.length > max;
}

/** بصمة مجهولة: SHA-256(ip + salt) — لا نخزن الـ IP الخام */
function ipHashOf(ip: string): string {
  const salt = process.env.AUTH_SECRET || EPHEMERAL_SALT;
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.dbId)
    return noStoreJson({ ok: true, showPrompt: false });

  try {
    const ip = extractClientIp(req.headers);
    const rows = await db
      .select({ id: guestPromptSeen.id })
      .from(guestPromptSeen)
      .where(eq(guestPromptSeen.ipHash, ipHashOf(ip)))
      .limit(1);
    return noStoreJson({ ok: true, showPrompt: rows.length === 0 });
  } catch (e) {
    console.error("guest-prompt GET failed:", e);
    return noStoreJson({ ok: true, showPrompt: false });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.dbId)
    return noStoreJson({ ok: true, recorded: false });

  const ip = extractClientIp(req.headers);
  if (
    isFlooding(`ip:${ip}`, RATE_MAX_IP) ||
    isFlooding("global:guest-prompt", RATE_MAX_GLOBAL)
  ) {
    return noStoreJson({ ok: false, recorded: false }, { status: 429 });
  }

  try {
    const ua = (req.headers.get("user-agent") || "").slice(0, 300);
    const hash = ipHashOf(ip);

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

    return noStoreJson({ ok: true, recorded: true });
  } catch (e) {
    console.error("guest-prompt POST failed:", e);
    return noStoreJson({ ok: true, recorded: false });
  }
}
