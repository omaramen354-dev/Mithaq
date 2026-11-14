import { sql } from "drizzle-orm";
import { db } from "@/db";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/health — فحص صحة النظام (عام)
   ============================================================ */

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return noStoreJson({
      ok: true,
      status: "healthy",
      database: "connected",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] فشل الاتصال بقاعدة البيانات:", error);
    return noStoreJson(
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
