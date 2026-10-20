import { headers } from "next/headers";

/* ============================================================
   base-url.ts — عنوان الموقع الحقيقي على الخادم
   يعتمد على ترويسات الطلب (x-forwarded-host) أولاً حتى تعمل
   روابط المشاركة كاملة في الإنتاج والتجربة المحلية بلا إعداد
   NEXT_PUBLIC_BASE_URL، ثم يقع على متغيّر البيئة.
   ============================================================ */

export async function requestBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
    /* خارج سياق الطلب — نكمل بمتغيّر البيئة */
  }
  return (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}
