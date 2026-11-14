import { encodeShareToken } from "./share-token";

/* ============================================================
   fingerprint.ts — دوال العرض النقية (تعمل على الخادم والمتصفح)
   لا تستورد crypto هنا إطلاقاً؛ بصمة SHA-256 في contract-hash.ts
   ============================================================ */

/* خوارزمية FNV-1a 32-bit لتوزيع أفضل ومنع تصادم الأرقام المرجعية */
function fnv1a32(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* مرجع التوثيق الحتمي (MEQ-XXXXXXXX بفضاء 10^8 لتفادي التصادمات) + رمز تحقق */
export function contractVerification(
  id: string,
  updatedAt?: string | Date | null,
  status?: string | null
): { ref: string; verify: string } {
  const updated =
    updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt || "";
  const refSeed = fnv1a32(id || "");
  const verifySeed = fnv1a32((id || "") + "|" + updated + "|" + (status || ""), 0x9e3779b9);
  return {
    ref: "MEQ-" + String(refSeed % 100_000_000).padStart(8, "0"),
    verify: (verifySeed >>> 0).toString(16).toUpperCase().padStart(8, "0"),
  };
}

/* رابط المشاركة العام — مرمّز في مقطع واحد بلا أسطر */
export function shareUrlFor(id: string, baseUrl?: string): string {
  const base = (baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return base + "/share/" + encodeURIComponent(encodeShareToken(id));
}

export function verifyPathFor(id: string): string {
  return "/verify/" + encodeURIComponent(encodeShareToken(id));
}

/** رابط مطلق لصفحة التحقق إن توفّر base، وإلا مسار نسبي */
export function verifyUrlFor(id: string, baseUrl?: string): string {
  const base = (baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return base + verifyPathFor(id);
}
