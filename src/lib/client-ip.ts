import { NextResponse } from "next/server";

/* ============================================================
   استخراج عنوان IP الموثوق + ترويسات منع التخزين المؤقت للـ APIs
   ============================================================ */

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;

function isValidIp(ip: string): boolean {
  const s = ip.trim();
  if (!s || s.length > 45) return false;
  if (IPV4_RE.test(s)) return true;
  if (s.includes(":") && IPV6_RE.test(s)) return true;
  return false;
}

/**
 * يستخرج IP الحقيقي للمستخدم دون الثقة بالجزء الأيسر القابل للتزوير من x-forwarded-for:
 * 1. x-vercel-forwarded-for (يضعه Vercel Edge ولا يقبل التزوير من العميل)
 * 2. cf-connecting-ip (Cloudflare)
 * 3. x-real-ip (الوكيل العكسي)
 * 4. آخر عنوان صالح (الأيمن) في x-forwarded-for (أضافه الوكيل لا العميل)
 */
export function extractClientIp(headersLike: {
  get(name: string): string | null;
}): string {
  const directCandidates = [
    headersLike.get("x-vercel-forwarded-for"),
    headersLike.get("cf-connecting-ip"),
    headersLike.get("x-real-ip"),
  ];

  for (const raw of directCandidates) {
    if (!raw) continue;
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isValidIp(parts[i])) return parts[i];
    }
  }

  const xff = headersLike.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    /* نأخذ العنوان الأيمن الذي أضافه الوكيل الموثوق لا الأيسر الذي قد يحقنه العميل */
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isValidIp(parts[i])) return parts[i];
    }
  }

  return "unknown";
}

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
} as const;

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, private");
  return NextResponse.json(body, { ...init, headers });
}
