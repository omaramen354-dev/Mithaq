import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, inArray, lt } from "drizzle-orm";
import { logEvent } from "@/lib/logger";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/cron/expire-plans — إرجاع الباقات المنتهية للمجانية
   ============================================================ */

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") || "";
    const expected = `Bearer ${secret}`;
    const a = Buffer.from(header, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
  if (process.env.NODE_ENV === "production") return false;
  const ua = req.headers.get("user-agent") || "";
  return ua.includes("vercel-cron") || ua.includes("curl");
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }

  const now = new Date();

  const downgraded = await db
    .update(users)
    .set({ plan: "free", planExpiresAt: null })
    .where(
      and(
        inArray(users.plan, ["basic", "verified", "freelancer", "office"]),
        lt(users.planExpiresAt, now)
      )
    )
    .returning({ id: users.id, name: users.name, email: users.email });

  for (const u of downgraded) {
    await logEvent({
      action: "plan_expired",
      entity: "user",
      entityId: u.id,
      actorName: u.name,
      actorEmail: u.email,
      detail: `انتهى الاشتراك الشهري لـ ${u.name} — أُعيد تلقائياً إلى الباقة المجانية`,
      meta: { automatic: true },
    });
  }

  return noStoreJson({
    ok: true,
    checkedAt: now.toISOString(),
    downgraded: downgraded.length,
  });
}
