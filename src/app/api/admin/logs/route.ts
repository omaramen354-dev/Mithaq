import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/logs — سجل أحداث المنصة (للمشرفين فقط)
   GET ?entity=contract|user|payment|auth|system&action=...&limit=100
   يعيد الأحدث أولاً
   ============================================================ */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.dbId || !session.user.isAdmin) return null;
  return session;
}

const ENTITIES = ["contract", "user", "payment", "auth", "system"] as const;

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const entity = sp.get("entity") || "";
  const action = sp.get("action") || "";
  const limit = Math.min(Math.max(Number(sp.get("limit") || 120), 1), 300);

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

  return NextResponse.json({
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
