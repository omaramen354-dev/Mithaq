import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid } from "@/lib/contract-schema";

/* ============================================================
   حارس المشرف — يتحقق من الصلاحية مباشرة من قاعدة البيانات
   في كل طلب (لا يعتمد على JWT المؤقت)، حتى تسري إزالة الصلاحية
   فوراً بدون انتظار انتهاء الجلسة.
   ============================================================ */

export async function isAdminUser(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  try {
    const [row] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return Boolean(row?.isAdmin);
  } catch {
    return false;
  }
}

export async function requireAdminSession() {
  const session = await auth();
  const dbId = session?.user?.dbId;
  if (!session?.user || !dbId) return null;
  const admin = await isAdminUser(dbId);
  return admin ? session : null;
}
