import { db } from "@/db";
import { activityLogs } from "@/db/schema";

/* ============================================================
   logger.ts — تسجيل أحداث المنصة في activity_logs
   لا يرمي استثناءات أبداً: فشل اللوجس لا يجب أن يفشل العملية
   الأصلية (توقيع، حفظ عقد، دفعة...). آمن للإنتاج.
   ============================================================ */

export type LogEntity =
  | "contract"
  | "user"
  | "payment"
  | "auth"
  | "system"
  | "error";

export type LogInput = {
  action: string;
  entity: LogEntity;
  entityId?: string;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  detail?: string;
  meta?: Record<string, unknown>;
};

export async function logEvent(input: LogInput): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      action: input.action,
      entity: input.entity,
      entityId: input.entityId || "",
      actorId: input.actorId || null,
      actorName: input.actorName || "",
      actorEmail: input.actorEmail || "",
      detail: input.detail || "",
      meta: input.meta || {},
    });
  } catch (e) {
    console.error("[logger] فشل تسجيل الحدث:", input.action, e);
  }
}
