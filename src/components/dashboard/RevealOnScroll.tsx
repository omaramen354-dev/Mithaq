"use client";

import { useEffect } from "react";

/* ============================================================
   RevealOnScroll — كشف تدريجي للعناصر ذات الفئة .reveal
   يُركَّب مرة واحدة في الصفحة ويراقب كل عناصر .reveal ويضيف
   .visible عند ظهورها في نافذة العرض (مع احترام reduced-motion
   لأن CSS نفسه يعطّل التأثير في تلك الحالة).
   ============================================================ */

export default function RevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
