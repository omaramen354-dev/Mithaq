import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/health — فحص صحة النظام (عام)
   يتحقق من التشغيل + الاتصال الحي بقاعدة Neon
   يُستخدم في مراقبة Vercel واكتشاف المشاكل مبكراً
   ============================================================ */

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      status: "healthy",
      database: "connected",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    /* تفاصيل الخطأ تُسجّل داخلياً فقط — لا تُعاد للعامة حتى لا تكشف
       مضيف قاعدة البيانات أو تفاصيل الاتصال. */
    console.error("[health] فشل الاتصال بقاعدة البيانات:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
