import { z } from "zod";

/* ============================================================
   قواعد التحقق المشتركة (Zod + فحوصات ثنائية للتوقيعات والـ UUID)
   تُستخدم في الـ APIs وفي النماذج على العميل — مصدر حقيقة واحد.
   ============================================================ */

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

const strictEmailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  .transform((v) => v.toLowerCase());

export type Party2EmailResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

/**
 * يتحقق من بريد الطرف الثاني ببروتوكول الحجز المسبق:
 * - في وضع الإرسال عبر الرابط (required = true): إلزامي وبصيغة صحيحة.
 * - في التوقيع السريع (required = false): إن كان فارغاً يُقبل، وإن كُتب يجب أن يكون صحيحاً.
 */
export function parseParty2Email(
  raw: unknown,
  opts?: { required?: boolean }
): Party2EmailResult {
  const required = opts?.required ?? false;
  const str = typeof raw === "string" ? raw.trim() : "";

  if (!str) {
    if (required) {
      return {
        ok: false,
        message: "بريد الطرف الثاني (Gmail / Google) مطلوب لحجز العقد قبل إرساله.",
      };
    }
    return { ok: true, email: "" };
  }

  /* منع الأحرف التحكمية ومسافات الوسط */
  if (/[\r\n\t\s]/.test(str)) {
    return { ok: false, message: "صيغة بريد الطرف الثاني غير صالحة." };
  }

  const parsed = strictEmailSchema.safeParse(str);
  if (!parsed.success) {
    return {
      ok: false,
      message: "أدخل بريداً إلكترونياً صحيحاً للطرف الثاني (مثال: name@gmail.com).",
    };
  }

  return { ok: true, email: parsed.data };
}

const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BASE64_BODY_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * يتحقق أن التوقيع صورة PNG حقيقية (وليس نصاً مزيفاً يبدأ بـ iVBORw0KGgo):
 * 1. بادئة data:image/png;base64, وحد حجم آمن
 * 2. جسم Base64 صالح بالكامل بلا حروف محقونة
 * 3. التوقيع الثنائي 89 50 4E 47 0D 0A 1A 0A + ترويسة IHDR بأبعاد منطقية (1..4096)
 */
export function validatePngDataUrl(
  raw: unknown,
  maxChars = 300_000
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof raw !== "string") {
    return { ok: false, message: "ارسم التوقيع قبل الاعتماد." };
  }
  const value = raw.trim();
  if (!value.startsWith(PNG_PREFIX) || value.length < 100) {
    return { ok: false, message: "صيغة التوقيع غير صالحة — يجب أن تكون صورة PNG." };
  }
  if (value.length > maxChars) {
    return { ok: false, message: "حجم صورة التوقيع أكبر من المسموح." };
  }

  const b64 = value.slice(PNG_PREFIX.length);
  if (b64.length % 4 !== 0 || !BASE64_BODY_RE.test(b64)) {
    return { ok: false, message: "بيانات صورة التوقيع تالفة أو غير صالحة." };
  }

  const buf = Buffer.from(b64, "base64");
  /* أقل حجم لصورة PNG صالحة مع ترويسة IHDR هو 33 بايت */
  if (buf.length < 33) {
    return { ok: false, message: "صورة التوقيع غير مكتملة." };
  }

  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (buf[i] !== PNG_MAGIC[i]) {
      return { ok: false, message: "الملف المرسل ليس صورة PNG حقيقية." };
    }
  }

  /* IHDR يجب أن يكون أول chunk عند البايت 12..15 بطول 13 بايت */
  const ihdrLen = buf.readUInt32BE(8);
  const ihdrType = buf.subarray(12, 16).toString("ascii");
  if (ihdrLen !== 13 || ihdrType !== "IHDR") {
    return { ok: false, message: "ترويسة صورة PNG غير صالحة." };
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4096 || height > 4096) {
    return { ok: false, message: "أبعاد صورة التوقيع خارج النطاق المسموح." };
  }

  return { ok: true, value };
}
