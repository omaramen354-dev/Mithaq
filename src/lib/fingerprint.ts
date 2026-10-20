import { encodeShareToken } from "./share-token";

/* ============================================================
   fingerprint.ts — دوال العرض النقية (تعمل على الخادم والمتصفح)
   لا تستورد crypto هنا إطلاقاً؛ بصمة SHA-256 في contract-hash.ts
   ============================================================ */

/* مرجع التوثيق الحتمي (MEQ-XXXXX) + رمز تحقق قصير — ثابت لكل عقد */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function contractVerification(
  id: string,
  updatedAt?: string | Date | null,
  status?: string | null
): { ref: string; verify: string } {
  const updated =
    updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt || "";
  const refSeed = hashString(id || "");
  const verifySeed = hashString((id || "") + "|" + updated + "|" + (status || ""));
  return {
    ref: "MEQ-" + String(refSeed % 100000).padStart(5, "0"),
    verify: (verifySeed >>> 0).toString(16).toUpperCase().padStart(8, "0"),
  };
}

/* رابط المشاركة العام — مشفّر في مقطع واحد بلا أسطر */
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
