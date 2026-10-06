import type { MetadataRoute } from "next";

/* ============================================================
   robots.txt — يسمح لمحركات البحث بفهرسة الصفحات العامة
   ويحظر /admin و /api و /print و /me (صفحات خاصة/دوّن-داخلية)
   ============================================================ */
export default function robots(): MetadataRoute.Robots {
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com"
  ).replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/print/", "/me", "/verify/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
