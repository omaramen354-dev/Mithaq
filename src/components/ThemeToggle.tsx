"use client";

/* ============================================================
   ThemeToggle — زر تبديل الوضع الليلي (Dark Mode Toggle)
   يقرأ التفضيل المحفوظ في localStorage، ويضيف/يزيل كلاس "dark"
   على عنصر <html>. يُحفظ الاختيار تلقائياً بين الجلسات.
   ============================================================ */

import { useEffect, useState } from "react";

const STORAGE_KEY = "mithaq-theme";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const current = document.documentElement.classList.contains("dark");
    setIsDark(current);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* التخزين مكتوم — نتجاهل بأمان */
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"}
      aria-label="تبديل الوضع الليلي"
    >
      <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`} />
    </button>
  );
}
