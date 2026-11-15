import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { desc } from "drizzle-orm";
import { readBoundedJson } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";
import { decidePaymentRequest } from "@/lib/payment-decisions";

export const runtime = "nodejs";

/* ============================================================
   /api/admin/payment-requests — إدارة طلبات الدفع (للمشرفين)
   ============================================================ */

const requireAdmin = requireAdminSession;

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(paymentRequests)
    .orderBy(desc(paymentRequests.createdAt))
    .limit(50);
  return noStoreJson({ ok: true, requests: rows });
}

type Body = { id?: string; action?: "paid" | "rejected" | "freeze" | "unfreeze"; note?: string };

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
  if (
    !isUuid(id) ||
    (action !== "paid" && action !== "rejected" && action !== "freeze" && action !== "unfreeze")
  ) {
    return noStoreJson({ ok: false, message: "بيانات القرار غير صالحة." }, { status: 422 });
  }

  const res = await decidePaymentRequest(id, action, {
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    via: "admin",
  });

  return noStoreJson({ ok: res.ok, message: res.message }, { status: res.status });
}
