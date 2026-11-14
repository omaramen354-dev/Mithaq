/* ============================================================
   share-token.ts — ترميز رابط المشاركة (توافق خادم ومتصفح)
   تذكير أمني: العشوائية الأمنية الفعلية تأتي من shareToken (UUID v4
   بعشوائية 122-بت منفصل تماماً عن contract.id). هذا الترميز يضيف
   قناعاً خفيفاً مع base64url كي لا يظهر UUID خام في الرابط.
   الروابط القديمة (`mth_` أو UUID صريح) تبقى صالحة للتوافق للخلف.
   ============================================================ */

const LEGACY_PREFIX = "mth_";
const V2_PREFIX = "mth2_";
const MASK_KEY = new TextEncoder().encode("MithaqShareLinkV2#2026");

function xorMask(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ MASK_KEY[i % MASK_KEY.length] ^ ((i * 31) & 0xff);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

/** ترميز آمن للرابط — يعيد المقطع `mth2_...` */
export function encodeShareToken(token: string): string {
  if (!token) return "";
  if (token.startsWith(V2_PREFIX) || token.startsWith(LEGACY_PREFIX)) return token;
  const rawBytes = new TextEncoder().encode(token);
  return V2_PREFIX + bytesToBase64Url(xorMask(rawBytes));
}

/** فك الترميز — يقبل `mth2_...` أو `mth_...` القديم أو UUID الخام */
export function decodeShareToken(value: string): string {
  if (!value) return value;
  if (value.startsWith(V2_PREFIX)) {
    try {
      const unmasked = xorMask(base64UrlToBytes(value.slice(V2_PREFIX.length)));
      const decoded = new TextDecoder().decode(unmasked);
      return decoded || value;
    } catch {
      return value;
    }
  }
  if (value.startsWith(LEGACY_PREFIX)) {
    try {
      const decoded = new TextDecoder().decode(
        base64UrlToBytes(value.slice(LEGACY_PREFIX.length))
      );
      return decoded || value;
    } catch {
      return value;
    }
  }
  return value;
}
