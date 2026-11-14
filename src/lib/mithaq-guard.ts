import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { contracts, transactions, users } from "@/db/schema";
import { isUuid } from "@/lib/contract-schema";
import { PLAN_LIMITS } from "@/lib/plans";

/* ============================================================
   mithaq-guard.ts — حاجز حماية عقود واشتراكات ميثاق
   1. يفحص حالة التجميد المالي للمستخدم أو لصاحب العقد عبر استعلام
      مفهرس مباشر (limit 1) — ويعمل بوضع Fail-Closed عند الخطأ.
   2. مصدر حقيقة موحّد للتحقق من أهلية إنشاء العقود وحدود الباقات
      (free / single / basic / verified / freelancer / office)
      يُستخدم في POST /api/contracts و POST /api/contracts/restore.
   ============================================================ */

export type SubscriptionGuardResult =
  | { suspended: false }
  | { suspended: true };

/** هل هذا المستخدم مجمّد حالياً بسبب مخالفة مالية؟ */
export async function isUserSuspended(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.status, "suspended")
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** هل صاحب هذا العقد مجمّد حالياً؟ (يُستخدم في /verify و /share و /print و /sign والتوقيع) */
export async function isOwnerSuspended(
  contractId: string
): Promise<SubscriptionGuardResult> {
  if (!isUuid(contractId)) return { suspended: false };
  try {
    const rows = await db
      .select({ ownerId: contracts.ownerId })
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1);

    const contract = rows[0];
    if (!contract?.ownerId) return { suspended: false };

    const suspended = await isUserSuspended(contract.ownerId);
    return suspended ? { suspended: true } : { suspended: false };
  } catch (err) {
    /* Fail-Closed: عند فشل التحقق الأمني لا نمرر العقد بصمت */
    console.error("isOwnerSuspended check failed:", err);
    return { suspended: true };
  }
}

export type CreationAccessResult =
  | { allowed: true; plan: string; consumeSingle: boolean }
  | {
      allowed: false;
      status: 402 | 403;
      code: string;
      message: string;
      plan?: string;
      limit?: number;
      used?: number;
    };

/**
 * فحص موحّد قبل إنشاء أي عقد (سواء من /api/contracts أو /api/contracts/restore):
 * - يمنع المستخدم المجمّد فوراً (403)
 * - ينهي الاشتراكات الشهرية المنتهية تلقائياً
 * - يطبّق حد باقة العقد الواحد عبر isSingleUsed بدقة
 * - يطبّق الحدود الشهرية الصارمة لباقات free (3) و basic (7)
 */
export async function checkContractCreationAccess(
  userId: string
): Promise<CreationAccessResult> {
  if (!isUuid(userId)) {
    return {
      allowed: false,
      status: 403,
      code: "invalid_user",
      message: "جلسة غير صالحة.",
    };
  }

  /* 1. التجميد المالي يمنع إنشاء أي عقد فوراً — لا استثناءات */
  const suspended = await isUserSuspended(userId);
  if (suspended) {
    return {
      allowed: false,
      status: 403,
      code: "account_suspended",
      message:
        "تم تجميد حسابك بسبب مخالفة مالية. تواصل مع الدعم لتسوية الاشتراك قبل إنشاء عقود جديدة.",
    };
  }

  /* 2. قراءة حالة باقة المستخدم الحالية */
  const [userRow] = await db
    .select({
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      isSingleUsed: users.isSingleUsed,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let effectivePlan = userRow?.plan || "free";
  const now = new Date();

  /* إنهاء أي اشتراك محدد المدة (أساسي/موثّق/مستقل/مكاتب) فور انتهاء صلاحيته */
  if (
    effectivePlan !== "free" &&
    effectivePlan !== "single" &&
    userRow?.planExpiresAt &&
    userRow.planExpiresAt.getTime() < now.getTime()
  ) {
    effectivePlan = "free";
    await db
      .update(users)
      .set({ plan: "free", planExpiresAt: null })
      .where(eq(users.id, userId));
  }

  /* 3. باقة العقد الواحد: عقد واحد فقط، وبعد استهلاكه يُقفل حتى الترقية */
  if (effectivePlan === "single") {
    if (userRow?.isSingleUsed) {
      return {
        allowed: false,
        status: 402,
        code: "single_plan_used",
        plan: "single",
        limit: 1,
        used: 1,
        message:
          "لقد استهلكت عقد باقة «العقد الواحد». قم بالترقية لإنشاء عقود إضافية.",
      };
    }
    return { allowed: true, plan: "single", consumeSingle: true };
  }

  /* 4. الباقات غير المحدودة (verified / freelancer النشط / office النشط) */
  const limit = Object.hasOwn(PLAN_LIMITS, effectivePlan)
    ? PLAN_LIMITS[effectivePlan]
    : PLAN_LIMITS.free;

  if (limit === null) {
    return { allowed: true, plan: effectivePlan, consumeSingle: false };
  }

  /* 5. الباقات المحدودة شهرياً (free = 3, basic = 7) */
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [{ n: used }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contracts)
    .where(
      and(
        eq(contracts.ownerId, userId),
        gte(contracts.createdAt, monthStart)
      )
    );

  if (used >= limit) {
    return {
      allowed: false,
      status: 402,
      code: "plan_limit_reached",
      plan: effectivePlan,
      limit,
      used,
      message:
        effectivePlan === "free"
          ? `وصلت للحد المجاني (${limit} عقود هذا الشهر). قم بالترقية للاستمرار في إنشاء العقود.`
          : `وصلت لحد باقتك (${limit} عقود هذا الشهر). يمكنك الترقية لباقة أعلى.`,
    };
  }

  return { allowed: true, plan: effectivePlan, consumeSingle: false };
}
