import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logEvent } from "@/lib/logger";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   DELETE /api/admin/contracts/[id]
   حذف عقد من لوحة المشرف (مثل العقود التجريبية أو المخالفة)
   مع توثيق كامل في سجل activity_logs قبل الحذف.
   ============================================================ */

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireAdminSession();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return noStoreJson({ ok: false, message: "معرّف العقد غير صالح." }, { status: 422 });
  }

  const [existing] = await db
    .select({
      id: contracts.id,
      type: contracts.type,
      status: contracts.status,
      party1Name: contracts.party1Name,
      party2Name: contracts.party2Name,
      ownerId: contracts.ownerId,
    })
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1);

  if (!existing) {
    return noStoreJson({ ok: false, message: "العقد غير موجود." }, { status: 404 });
  }

  await db.delete(contracts).where(eq(contracts.id, id));

  await logEvent({
    action: "admin_contract_deleted",
    entity: "contract",
    entityId: existing.id,
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `حذف عقد (${existing.type} — ${existing.status}) بين ${existing.party1Name} و${existing.party2Name} من لوحة الإدارة`,
    meta: { ownerId: existing.ownerId, status: existing.status, type: existing.type },
  });

  return noStoreJson({ ok: true, message: "تم حذف العقد بنجاح." });
}
