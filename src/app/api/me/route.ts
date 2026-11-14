import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalize, readBoundedJson } from "@/lib/contract-text";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";

/* ============================================================
   /api/me — بروفايل المستخدم المسجّل
   GET: بيانات الحساب | PATCH: تحديث الهاتف/العنوان/التفضيلات
   مع تحقق Zod صارم وقائمة بيضاء لحقول preferences (منع التضخيم وحقن المفاتيح)
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

const patchBodySchema = z.object({
  phone: z.string().max(40).optional(),
  address: z.string().max(250).optional(),
  preferences: z
    .object({
      darkMode: z.boolean().optional(),
      emailNotifications: z.boolean().optional(),
      contractReminders: z.boolean().optional(),
      language: z.enum(["ar", "en"]).optional(),
    })
    .strict()
    .optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.dbId)
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });

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
    return noStoreJson({ ok: false, message: "الحساب غير موجود." }, { status: 404 });

  return noStoreJson({ ok: true, user });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dbId)
    return noStoreJson({ ok: false, message: "سجّل الدخول أولاً." }, { status: 401 });

  const parsedBody = await readBoundedJson(req, 16_384);
  if (!parsedBody.ok) {
    return noStoreJson(
      { ok: false, message: parsedBody.message },
      { status: parsedBody.status }
    );
  }

  const validated = patchBodySchema.safeParse(parsedBody.data);
  if (!validated.success) {
    return noStoreJson(
      { ok: false, message: "بيانات التحديث غير صالحة أو تتجاوز الحدود المسموحة." },
      { status: 422 }
    );
  }
  const body = validated.data;

  /* جلب التفضيلات الحالية ودمج الحقول المسموح بها فقط */
  let mergedPrefs: Prefs = DEFAULT_PREFS;
  if (body.preferences) {
    const current = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, session.user.dbId))
      .limit(1);
    const cur = current[0]?.preferences || DEFAULT_PREFS;
    mergedPrefs = {
      darkMode:
        body.preferences.darkMode !== undefined
          ? body.preferences.darkMode
          : Boolean(cur.darkMode),
      emailNotifications:
        body.preferences.emailNotifications !== undefined
          ? body.preferences.emailNotifications
          : Boolean(cur.emailNotifications),
      contractReminders:
        body.preferences.contractReminders !== undefined
          ? body.preferences.contractReminders
          : Boolean(cur.contractReminders),
      language:
        body.preferences.language !== undefined
          ? body.preferences.language
          : cur.language === "en"
            ? "en"
            : "ar",
    };
  }

  const updated = await db
    .update(users)
    .set({
      ...(body.phone !== undefined ? { phone: normalize(body.phone).slice(0, 40) } : {}),
      ...(body.address !== undefined ? { address: normalize(body.address).slice(0, 250) } : {}),
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

  return noStoreJson({ ok: true, user: updated[0] });
}
