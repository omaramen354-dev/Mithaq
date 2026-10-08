import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contracts, transactions } from "@/db/schema";

/* ============================================================
   mithaq-guard.ts — حاجز حماية عقود ميثاق
   يفحص حالة اشتراك صاحب العقد (ميثاق كاش) قبل عرض أي عقد
   أو بصمته على المسارات العامة (/verify و /share و /print).
   إذا كان المشترك مجمداً (suspended) بسبب مخالفة مالية،
   تُحجب كل بيانات العقد والهاش ويُعرض الحجب الاحترافي.
   ============================================================ */

export type SubscriptionGuardResult =
  | { suspended: false }
  | { suspended: true };

/** هل صاحب هذا العقد مجمد حالياً؟ (آخر معاملة بحالة suspended) */
export async function isOwnerSuspended(
  contractId: string
): Promise<SubscriptionGuardResult> {
  const rows = await db
    .select({ ownerId: contracts.ownerId })
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1);

  const contract = rows[0];
  if (!contract?.ownerId) return { suspended: false };

  const txRows = await db
    .select({ status: transactions.status })
    .from(transactions)
    .where(eq(transactions.userId, contract.ownerId))
    .limit(500);

  /* أي معاملة مجمّدة تصادر الاشتراك كاملاً — لا استثناءات */
  if (txRows.some((t) => t.status === "suspended")) {
    return { suspended: true };
  }
  return { suspended: false };
}
