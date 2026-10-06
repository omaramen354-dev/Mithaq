import type { MetadataRoute } from "next";

/* ============================================================
   sitemap.xml — الصفحات العامة القابلة للفهرسة
   (share/verify ديناميكية بتوكنات فريدة — لا تُدرج عمدًا)
   ============================================================ */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com"
  ).replace(/\/+$/, "");
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
