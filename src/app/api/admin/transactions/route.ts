import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { readBoundedJson } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";
import { decideTransaction } from "@/lib/payment-decisions";

export const runtime = "nodejs";

/* ============================================================
   /api/admin/transactions — إدارة معاملات شام كاش (للمشرفين)
   - verify:    تأكيد الحوالة وتفعيل الباقة
   - suspend:   تجميد الحساب + إبطال الباقة و paidOnce و isSingleUsed
   - unsuspend: رفع الحظر وإعادة الحالة لغير موثقة للمراجعة
   ============================================================ */

const requireAdmin = requireAdminSession;

type Body = {
  id?: string;
  action?: "verify" | "suspend" | "unsuspend";
};

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }
  const rows = await db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      userName: users.name,
      userEmail: users.email,
      transactionNumber: transactions.transactionNumber,
      contactPhone: transactions.contactPhone,
      planName: transactions.planName,
      status: transactions.status,
      createdAt: transactions.createdAt,
      reviewedAt: transactions.reviewedAt,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.userId, users.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);

  return noStoreJson({
    ok: true,
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const parsed = await readBoundedJson<Body>(req, 16_384);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const body = parsed.data;

  const id = String(body.id || "").trim();
  const action = body.action;
  if (!isUuid(id) || (action !== "verify" && action !== "suspend" && action !== "unsuspend")) {
    return noStoreJson({ ok: false, message: "بيانات القرار غير صالحة." }, { status: 422 });
  }

  const res = await decideTransaction(id, action, {
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    via: "admin",
  });

  return noStoreJson({ ok: res.ok, message: res.message }, { status: res.status });
}
