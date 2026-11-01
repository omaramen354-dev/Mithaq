import type { MetadataRoute } from "next";
import { CONTRACT_GUIDES } from "@/lib/contract-guides";

/* ============================================================
   sitemap.xml — الصفحات العامة القابلة للفهرسة
   (share/verify ديناميكية بتوكنات فريدة — لا تُدرج عمدًا)
   ============================================================ */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com"
  ).replace(/\/+$/, "");
  const now = new Date();

  /* صفحات الهبوط المستقلة لكل نوع عقد — أهم مسارات الاكتساب
     من البحث («نموذج عقد تصميم»، «عقد إيجار سكني»...) */
  const guides: MetadataRoute.Sitemap = CONTRACT_GUIDES.map((g) => ({
    url: `${base}/contracts/${g.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/contracts`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...guides,
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
