import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUserSuspended } from "@/lib/mithaq-guard";
import { isUuid } from "@/lib/contract-schema";

/* ============================================================
   branding.ts — حارس شعار المكتب المخصّص (حصراً لباقة المكاتب $49)
   - يتحقق الخادم من أن المستخدم على باقة `office` النشطة (أو مشرف)
     وغير مجمّد مالياً — سواء عند الحفظ أو عند عرض العقد/الطباعة.
   - يقبل حصراً صور PNG أو JPEG صالحة بفحص البايتات الثنائية
     (Magic Bytes) لمنع XSS عبر SVG، وبحد أقصى 150 KB.
   ============================================================ */

export const MAX_LOGO_BYTES = 150_000; // 150 KB
export const MAX_OFFICE_NAME = 80;

export type OfficeBranding = {
  officeName: string;
  officeLogo: string;
};

/** هل يملك الحساب حالياً أهلية استخدام شعار المكتب المخصّص ($49/شهر)؟ */
export function hasActiveOfficePlan(user: {
  plan?: string | null;
  planExpiresAt?: Date | string | null;
  isAdmin?: boolean | null;
}): boolean {
  if (user.isAdmin) return true;
  if (user.plan !== "office") return false;
  if (!user.planExpiresAt) return true;
  const exp =
    user.planExpiresAt instanceof Date
      ? user.planExpiresAt.getTime()
      : new Date(user.planExpiresAt).getTime();
  return Number.isFinite(exp) && exp > Date.now();
}

/** التحقق الثنائي من أن شعار المكتب صورة PNG أو JPEG حقيقية بحد 150KB */
export function validateOfficeLogoDataUrl(
  raw: unknown
): { ok: true; value: string } | { ok: false; message: string } {
  if (raw === "" || raw === null) return { ok: true, value: "" };
  if (typeof raw !== "string") {
    return { ok: false, message: "صيغة الشعار غير صالحة." };
  }
  const s = raw.trim();
  if (!s) return { ok: true, value: "" };

  const match = s.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return {
      ok: false,
      message: "يُقبل فقط شعار بصيغة PNG أو JPG (لا يُسمح بملفات SVG أو HTML).",
    };
  }

  const kind = match[1];
  const b64 = match[2];
  if (b64.length > Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 16) {
    return { ok: false, message: "حجم الشعار أكبر من الحد المسموح (150 كيلوبايت)." };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, message: "تعذر قراءة بيانات الشعار." };
  }
  if (buf.length < 16 || buf.length > MAX_LOGO_BYTES) {
    return { ok: false, message: "حجم الشعار غير صالح (الحد الأقصى 150 كيلوبايت)." };
  }

  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

  if (kind === "png" && !isPng) {
    return { ok: false, message: "محتوى الملف لا يطابق صورة PNG حقيقية." };
  }
  if ((kind === "jpeg" || kind === "jpg") && !isJpeg) {
    return { ok: false, message: "محتوى الملف لا يطابق صورة JPG حقيقية." };
  }

  const canonicalMime = isPng ? "image/png" : "image/jpeg";
  return { ok: true, value: `data:${canonicalMime};base64,${b64}` };
}

/** جلب شعار المكتب الفعّال لمالك عقد (يُعاد null تلقائياً إن انتهت باقة الـ $49) */
export async function getActiveOwnerBranding(
  ownerId: string | null | undefined
): Promise<OfficeBranding | null> {
  if (!ownerId || !isUuid(ownerId)) return null;
  try {
    const [owner] = await db
      .select({
        plan: users.plan,
        planExpiresAt: users.planExpiresAt,
        isAdmin: users.isAdmin,
        preferences: users.preferences,
      })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);

    if (!owner || !hasActiveOfficePlan(owner)) return null;
    if (!owner.isAdmin && (await isUserSuspended(ownerId))) return null;

    const prefs = owner.preferences as
      | { officeName?: string; officeLogo?: string }
      | undefined;
    const officeName = String(prefs?.officeName || "").trim().slice(0, MAX_OFFICE_NAME);
    const logoCheck = validateOfficeLogoDataUrl(prefs?.officeLogo || "");
    const officeLogo = logoCheck.ok ? logoCheck.value : "";
    if (!officeName && !officeLogo) return null;

    return { officeName, officeLogo };
  } catch {
    return null;
  }
}
