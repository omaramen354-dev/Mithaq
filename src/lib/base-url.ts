import { headers } from "next/headers";

/* ============================================================
   base-url.ts — عنوان الموقع الموثوق على الخادم
   لا يثق أبداً في x-forwarded-host (منع Host Header Injection):
   يعتمد أولاً على متغيرات البيئة المضبوطة (NEXT_PUBLIC_BASE_URL /
   AUTH_URL / VERCEL_URL)، ولا يلجأ لترويسة host إلا بعد مطابقتها
   بقائمة سماح صارمة (ALLOWED_HOSTS).
   ============================================================ */

const SAFE_HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/i;

function allowedHosts(): Set<string> {
  const set = new Set<string>(["miithaq.com", "www.miithaq.com"]);
  for (const envUrl of [
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.AUTH_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ]) {
    if (!envUrl) continue;
    try {
      set.add(new URL(envUrl).host.toLowerCase());
    } catch {
      /* تجاهل */
    }
  }
  const extra = String(process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const h of extra) set.add(h);
  return set;
}

function isTrustedHost(host: string): boolean {
  const lower = host.trim().toLowerCase();
  if (!SAFE_HOST_RE.test(lower)) return false;
  if (
    lower.startsWith("localhost:") ||
    lower === "localhost" ||
    lower.startsWith("127.0.0.1:") ||
    lower === "127.0.0.1"
  ) {
    return process.env.NODE_ENV !== "production";
  }
  return allowedHosts().has(lower);
}

export async function requestBaseUrl(): Promise<string> {
  const configured = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  )
    .trim()
    .replace(/\/+$/, "");

  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      /* متابعة */
    }
  }

  try {
    const h = await headers();
    const rawHost = (h.get("host") || "").split(",")[0].trim();
    if (rawHost && isTrustedHost(rawHost)) {
      const isLocal =
        rawHost.startsWith("localhost") || rawHost.startsWith("127.0.0.1");
      return `${isLocal ? "http" : "https"}://${rawHost}`;
    }
  } catch {
    /* خارج سياق الطلب */
  }

  return "https://miithaq.com";
}
