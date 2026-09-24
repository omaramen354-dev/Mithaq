"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";

/* ============================================================
   LoginGateModal — نافذة تأكيد الحفظ
   تظهر للزائر عند حفظ العقد أو طباعته: خطوة واحدة سريعة
   عبر Google، وبيانات العقد محفوظة على جهازه وستُستعاد
   تلقائياً بعد الدخول.
   ============================================================ */

export default function LoginGateModal({
  open,
  action,
  onClose,
}: {
  open: boolean;
  action: "save" | "print";
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 28, 22, 0.55)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          maxWidth: 430,
          width: "100%",
          margin: 0,
          padding: "28px 26px",
          textAlign: "center",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            border: 0,
            background: "transparent",
            fontSize: 18,
            cursor: "pointer",
            color: "var(--muted)",
            lineHeight: 1,
            padding: 6,
          }}
        >
          ✕
        </button>

        <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}>
          <Logo height={36} />
        </div>

        <h2 style={{ margin: "4px 0 6px", fontSize: 17, fontWeight: 900 }}>
          {action === "print" ? "طباعة العقد" : "حفظ العقد"} — خطوة واحدة
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>
          بيانات عقدك محفوظة على جهازك ✅
        </p>
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 0 20px" }}>
          سجّل الدخول عبر Google ليُحفظ العقد في حسابك مع بصمة SHA-256 ورابط
          توقيع وتحقق —{" "}
          <b style={{ color: "var(--ink)" }}>
            وستجده في لوحتك تلقائياً بعد الدخول دون إعادة كتابة أي شيء.
          </b>
        </p>

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center" }}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            signIn("google", { callbackUrl: "/" });
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#fff"
              d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.7 4.1-5.35 4.1A6.1 6.1 0 1 1 16.2 7l2.2-2.1A9 9 0 1 0 21 12c0-.3 0-.6-.05-.9z"
            />
          </svg>
          {busy ? "جاري التحويل…" : "المتابعة عبر Google"}
        </button>

        <button
          className="btn btn-soft"
          style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
          onClick={onClose}
        >
          رجوع
        </button>

        <p style={{ color: "var(--muted)", fontSize: 10.5, margin: "12px 0 0" }}>
          بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية — لا نشارك
          بياناتك مع أي طرف ثالث.
        </p>
      </div>
    </div>
  );
}
