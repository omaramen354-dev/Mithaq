"use client";

import { useEffect } from "react";

/* ============================================================
   ErrorReporter — التقاط أخطاء المتصفح تلقائياً وإرسالها
   إلى /api/errors (التي تخزنها في activity_logs للإدارة).
   يغطي: أخطاء JS العامة (window.onerror)، الوعود المرفوضة
   (unhandledrejection)، وأخطاء تحميل الموارد.
   لا يؤثر على الأداء: إرسال بـ keepalive وبحد أدنى من البيانات،
   وبحد أقصى 20 خطأ لكل جلسة حتى لا يُغرق الخادم عند عطل شامل.
   مركّب مرة واحدة في layout.tsx.
   ============================================================ */

declare global {
  interface Window {
    __mithaqErrInstalled?: boolean;
    __mithaqErrCount?: number;
  }
}

export default function ErrorReporter() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__mithaqErrInstalled) return;
    window.__mithaqErrInstalled = true;
    window.__mithaqErrCount = 0;

    const MAX_PER_SESSION = 20;

    function send(payload: Record<string, unknown>) {
      try {
        if ((window.__mithaqErrCount || 0) >= MAX_PER_SESSION) return;
        window.__mithaqErrCount = (window.__mithaqErrCount || 0) + 1;
        const body = JSON.stringify({
          source: "browser",
          url: window.location.href,
          userAgent: navigator.userAgent,
          ...payload,
        });
        fetch("/api/errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* صامت — لا يجوز أن يفشل مُرسل الأخطاء */
      }
    }

    /* أخطاء JavaScript العامة */
    const on_error = (event: ErrorEvent) => {
      send({
        message: event.message,
        stack: event.error?.stack || "",
        line: event.lineno,
        col: event.colno,
      });
    };

    /* الوعود المرفوضة غير المعالجة */
    const on_rejection = (event: PromiseRejectionEvent) => {
      const r = event.reason;
      send({
        message: typeof r === "string" ? r : r?.message || "Unhandled promise rejection",
        stack: r?.stack || "",
      });
    };

    /* فشل تحميل موارد (سكربت/صورة/خط) */
    const on_resource = (event: Event) => {
      const t = event.target as HTMLElement | null;
      if (t && t.tagName && ["SCRIPT", "IMG", "LINK"].includes(t.tagName)) {
        const el = t as HTMLImageElement & { src?: string; href?: string };
        send({
          message: `فشل تحميل مورد: <${t.tagName.toLowerCase()}> ${el.src || el.href || ""}`,
          stack: "",
        });
      }
    };

    window.addEventListener("error", on_error);
    window.addEventListener("unhandledrejection", on_rejection);
    window.addEventListener("error", on_resource, true); // capture phase لموارد التحميل

    return () => {
      window.removeEventListener("error", on_error);
      window.removeEventListener("unhandledrejection", on_rejection);
      window.removeEventListener("error", on_resource, true);
    };
  }, []);

  return null;
}
