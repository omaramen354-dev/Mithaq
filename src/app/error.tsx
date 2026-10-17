"use client";

import { useEffect } from "react";

/* ============================================================
   error — حدود الخطأ على مستوى المسار (Route Error Boundary).
   عند فشل أي Server Component (مثلاً تعذر الاتصال بقاعدة
   بيانات Neon أثناء العرض) لا تنهار المنصة برسالة React
   مصغّرة #441، بل تظهر شاشة عربية أنيقة بهوية ميثاق مع زر
   إعادة المحاولة، ويُرسل التقرير إلى /api/errors للوحة الأدمن.
   ============================================================ */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          source: "browser",
          message: `[Boundary] ${error.message}`,
          stack: error.stack || "",
          component: "error-boundary",
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {});
    } catch {
      /* صامت — إبلاغ الأخطاء لا يجب أن يكسر الشاشة */
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight: "80vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fffdf6",
          border: "1.5px solid rgba(212, 168, 67, 0.4)",
          borderRadius: 22,
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.5)",
          padding: "38px 34px",
          textAlign: "center",
          maxWidth: 420,
          width: "100%",
        }}
      >
        <div
          style={{
            width: 62,
            height: 62,
            margin: "0 auto 16px",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #1d4a3e, #2e6d5c)",
            color: "#f6d979",
            fontSize: 26,
            border: "2px solid #d4a843",
          }}
        >
          ⚠️
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 900, color: "#1d4a3e", margin: "0 0 8px" }}>
          حدث خطأ غير متوقع
        </h1>
        <p style={{ fontSize: 13.5, color: "#666", fontWeight: 600, margin: "0 0 18px" }}>
          تم إرسال تقرير الخطأ تلقائياً لفريق ميثاق — جرّب إعادة المحاولة.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            font: "inherit",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            border: "none",
            borderRadius: 12,
            padding: "11px 26px",
            background: "linear-gradient(135deg, #d4a843, #f6d979)",
            color: "#122e26",
          }}
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
