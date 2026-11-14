import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { db } from "@/db";
import { contracts, users } from "@/db/schema";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/admin/contracts — متصفح شامل لكل العقود للمشرف
   يدعم البحث (أسماء الأطراف/الموضوع/المدينة/البريد)، الفلترة حسب
   الحالة أو النوع أو العقود غير المرتبطة بمالك (orphan).
   ============================================================ */

const VALID_STATUSES = new Set(["draft", "partially_signed", "signed"]);

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  const status = (req.nextUrl.searchParams.get("status") || "").trim().slice(0, 30);
  const type = (req.nextUrl.searchParams.get("type") || "").trim().slice(0, 40);

  const filters = [];
  if (q) {
    filters.push(
      or(
        ilike(contracts.party1Name, `%${q}%`),
        ilike(contracts.party2Name, `%${q}%`),
        ilike(contracts.subject, `%${q}%`),
        ilike(contracts.city, `%${q}%`),
        ilike(contracts.party2Email, `%${q}%`),
        ilike(users.name, `%${q}%`),
        ilike(users.email, `%${q}%`)
      )
    );
  }
  if (status === "orphan") {
    filters.push(isNull(contracts.ownerId));
  } else if (VALID_STATUSES.has(status)) {
    filters.push(eq(contracts.status, status));
  }
  if (type && type !== "all") {
    filters.push(eq(contracts.type, type));
  }

  const rows = await db
    .select({
      id: contracts.id,
      ownerId: contracts.ownerId,
      ownerName: users.name,
      ownerEmail: users.email,
      type: contracts.type,
      status: contracts.status,
      party1Name: contracts.party1Name,
      party2Name: contracts.party2Name,
      party2Email: contracts.party2Email,
      amount: contracts.amount,
      city: contracts.city,
      createdAt: contracts.createdAt,
    })
    .from(contracts)
    .leftJoin(users, eq(contracts.ownerId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(contracts.createdAt))
    .limit(150);

  return noStoreJson({
    ok: true,
    contracts: rows.map((c) => ({
      id: c.id,
      ownerId: c.ownerId,
      ownerName: c.ownerName || null,
      ownerEmail: c.ownerEmail || null,
      type: c.type,
      status: c.status,
      party1Name: c.party1Name,
      party2Name: c.party2Name,
      party2Email: c.party2Email || null,
      amount: c.amount || "",
      city: c.city || "",
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
