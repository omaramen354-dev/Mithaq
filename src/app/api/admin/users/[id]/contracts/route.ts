import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { contracts, users } from "@/db/schema";
import { desc, eq, or, sql } from "drizzle-orm";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/admin/users/[id]/contracts
   جلب جميع العقود المرتبطة بمستخدم معيّن (كمنشئ أو كطرف ثانٍ)
   للعرض المباشر داخل لوحة إدارة المستخدمين.
   ============================================================ */

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return noStoreJson({ ok: false, message: "معرّف المستخدم غير صالح." }, { status: 422 });
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, googleId: users.googleId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return noStoreJson({ ok: false, message: "المستخدم غير موجود." }, { status: 404 });
  }

  const conditions = [eq(contracts.ownerId, user.id)];
  if (user.email) {
    conditions.push(eq(sql`lower(${contracts.party2Email})`, user.email.toLowerCase()));
  }
  if (user.googleId) {
    conditions.push(eq(contracts.party2GoogleId, user.googleId));
  }

  const rows = await db
    .select({
      id: contracts.id,
      ownerId: contracts.ownerId,
      type: contracts.type,
      status: contracts.status,
      party1Name: contracts.party1Name,
      party2Name: contracts.party2Name,
      amount: contracts.amount,
      city: contracts.city,
      createdAt: contracts.createdAt,
    })
    .from(contracts)
    .where(or(...conditions))
    .orderBy(desc(contracts.createdAt))
    .limit(50);

  return noStoreJson({
    ok: true,
    contracts: rows.map((c) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      party1Name: c.party1Name,
      party2Name: c.party2Name,
      amount: c.amount || "",
      city: c.city || "",
      role: c.ownerId === user.id ? "owner" : "party2",
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
