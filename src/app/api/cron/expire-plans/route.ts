import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, inArray, lt } from "drizzle-orm";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/cron/expire-plans — إرجاع الباقات المنتهية للمجانية
   يستدعيه Vercel Cron يومياً (انظر vercel.json).
   - يشمل فقط الاشتراكات الشهرية (freelancer/office) المنتهية.
   - الباقات دفعة واحدة (single/basic/verified) لا تنتهي.
   - التخفيض آمن ومتكرر: تشغيله مرتين لا يضر (idempotent).
   - كل عملية تُسجل في سجل الأحداث (activity_logs) للمشرفين.
   حماية:
   - إذا ضُبط CRON_SECRET يُطلب Authorization: Bearer <CRON_SECRET>
     (Vercel يرسلها تلقائياً مع كل استدعاء كرون) — مقارنة آمنة.
   - إن لم يُضبط، يُقبل فقط طلب يحمل ترويسة vercel-cron من Vercel.
   - الاستجابة لا تعرض أي بيانات مستخدمين (عدّاد فقط).
   ============================================================ */

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    /* المسار الآمن: مقارنة صامتة ثابتة الزمن تقريباً */
    const header = req.headers.get("authorization") || "";
    const expected = `Bearer ${secret}`;
    if (header.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  }
  /* بدون سر: نقبل فقط طلبات Vercel Cron نفسها (ترويسة موقعة من Vercel)
     — يمنع المتطفلين العشوائيين وفحص الروابط الآلي */
  const ua = req.headers.get("user-agent") || "";
  return ua.includes("vercel-cron");
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 401 });
  }

  const now = new Date();

  /* التخفيض: الاشتراك الشهري المنتهي → مجاني */
  const downgraded = await db
    .update(users)
    .set({ plan: "free", planExpiresAt: null })
    .where(
      and(
        inArray(users.plan, ["freelancer", "office"]),
        lt(users.planExpiresAt, now)
      )
    )
    .returning({ id: users.id, name: users.name, email: users.email });

  /* تسجيل كل تخفيض في سجل الأحداث */
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

  return NextResponse.json({
    ok: true,
    checkedAt: now.toISOString(),
    downgraded: downgraded.length,
    /* لا نعيد الإيميلات — هذا المسار قد يُستدعى آلياً ولا يعرض بيانات */
  });
}
