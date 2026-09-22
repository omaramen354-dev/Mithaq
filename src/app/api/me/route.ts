import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalize } from "@/lib/contract-text";

export const runtime = "nodejs";

/* ============================================================
   /api/me — بروفايل المستخدم المسجّل
   GET: بيانات الحساب | PATCH: تحديث الهاتف/العنوان/التفضيلات
   ============================================================ */

type Prefs = {
  darkMode: boolean;
  emailNotifications: boolean;
  contractReminders: boolean;
  language: string;
};

const DEFAULT_PREFS: Prefs = {
  darkMode: false,
  emailNotifications: true,
  contractReminders: true,
  language: "ar",
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId)
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      picture: users.picture,
      phone: users.phone,
      address: users.address,
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      preferences: users.preferences,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.dbId))
    .limit(1);

  const user = rows[0];
  if (!user)
    return NextResponse.json({ ok: false, message: "الحساب غير موجود." }, { status: 404 });

  return NextResponse.json({ ok: true, user });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId)
    return NextResponse.json({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });

  let body: { phone?: string; address?: string; preferences?: Partial<Prefs> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "صيغة JSON غير صحيحة." }, { status: 400 });
  }

  /* جلب التفضيلات الحالية ودمج التحديث الجديد عليها */
  let mergedPrefs: Prefs = DEFAULT_PREFS;
  if (body.preferences) {
    const current = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, session.user.dbId))
      .limit(1);
    mergedPrefs = { ...DEFAULT_PREFS, ...(current[0]?.preferences || {}), ...body.preferences };
  }

  const updated = await db
    .update(users)
    .set({
      ...(body.phone !== undefined ? { phone: normalize(body.phone) } : {}),
      ...(body.address !== undefined ? { address: normalize(body.address) } : {}),
      ...(body.preferences ? { preferences: mergedPrefs } : {}),
    })
    .where(eq(users.id, session.user.dbId))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      address: users.address,
      preferences: users.preferences,
    });

  return NextResponse.json({ ok: true, user: updated[0] });
}
