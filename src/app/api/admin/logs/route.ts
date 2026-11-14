import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/logs — سجل أحداث المنصة (للمشرفين فقط)
   ============================================================ */

const requireAdmin = requireAdminSession;
const ENTITIES = ["contract", "user", "payment", "auth", "system"] as const;

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const entity = sp.get("entity") || "";
  const action = sp.get("action") || "";
  const rawLimit = Number(sp.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), 300)
      : 120;

  const filters = [];
  if (ENTITIES.includes(entity as (typeof ENTITIES)[number])) {
    filters.push(eq(activityLogs.entity, entity));
  }
  if (action) filters.push(eq(activityLogs.action, action));

  const rows = await db
    .select()
    .from(activityLogs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return noStoreJson({
    ok: true,
    logs: rows.map((r) => ({
      id: r.id,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
