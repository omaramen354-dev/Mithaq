/* ============================================================
   share-token.ts — ترميز رابط المشاركة
   يحوّل UUID العقد إلى مقطع قصير مشفّر (base64url) بحيث لا يظهر
   المعرّف الخام في الرابط، ويبقى قابلاً لفك الترميز على الخادم.
   الروابط القديمة (UUID صريح) تبقى صالحة — التوافق للخلف.
   ============================================================ */

const PREFIX = "mth_";

function toBase64Url(plain: string): string {
  const bytes = new TextEncoder().encode(plain);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(plain, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** ترميز آمن للرابط — يعيد المقطع `mth_...` */
export function encodeShareToken(token: string): string {
  if (!token) return "";
  if (token.startsWith(PREFIX)) return token;
  return PREFIX + toBase64Url(token);
}

/** فك الترميز — يقبل المقطع المشفّر أو UUID الخام (روابط قديمة) */
export function decodeShareToken(value: string): string {
  if (!value) return value;
  if (!value.startsWith(PREFIX)) return value;
  try {
    const decoded = fromBase64Url(value.slice(PREFIX.length));
    return decoded || value;
  } catch {
    return value;
  }
}
