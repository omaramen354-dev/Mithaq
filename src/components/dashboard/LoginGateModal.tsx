"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";

/* ============================================================
   LoginGateModal — نافذة تأكيد الحفظ (الهوية الأسطورية)
   بطاقة عاجية بحدود ذهبية وزر ذهبي متدرج — تظهر للزائر عند
   حفظ العقد أو طباعته، وبياناته محفوظة وستُستعاد تلقائياً.
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
        background: "rgba(7, 31, 26, 0.58)",
        backdropFilter: "blur(10px)",
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
          maxWidth: 440,
          width: "100%",
          margin: 0,
          padding: "30px 28px",
          textAlign: "center",
          position: "relative",
          borderRadius: 30,
          border: "1px solid rgba(212, 168, 67, 0.45)",
          boxShadow: "0 34px 80px rgba(0,0,0,0.28)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          style={{
            position: "absolute",
            top: 14,
            left: 14,
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

        <div
          style={{
            display: "grid",
            placeItems: "center",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              padding: 14,
              borderRadius: 24,
              background: "linear-gradient(135deg, #071f1a, #1d4a3e)",
              boxShadow: "var(--shadow)",
            }}
          >
            <Logo height={44} />
          </div>
        </div>

        <h2
          style={{
            margin: "4px 0 6px",
            fontSize: 18,
            fontWeight: 900,
            color: "var(--green)",
          }}
        >
          {action === "print" ? "طباعة العقد" : "حفظ العقد"} — خطوة واحدة
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>
          بيانات عقدك محفوظة على جهازك ✅
        </p>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 12.5,
            margin: "0 0 20px",
            lineHeight: 1.9,
          }}
        >
          سجّل الدخول عبر Google ليُحفظ العقد في حسابك مع بصمة SHA-256 ورابط
          توقيع وتحقق —{" "}
          <b style={{ color: "var(--ink)" }}>
            وستجده في لوحتك تلقائياً بعد الدخول دون إعادة كتابة أي شيء.
          </b>
        </p>

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center", padding: "13px 18px" }}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            signIn("google", { callbackUrl: "/" });
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.7 4.1-5.35 4.1A6.1 6.1 0 1 1 16.2 7l2.2-2.1A9 9 0 1 0 21 12c0-.3 0-.6-.05-.9z"
            />
          </svg>
          {busy ? "جاري التحويل…" : "المتابعة عبر Google"}
        </button>

        <button
          className="btn btn-soft"
          style={{ width: "100%", justifyContent: "center", marginTop: 9 }}
          onClick={onClose}
        >
          رجوع
        </button>

        <p
          style={{
            color: "var(--muted)",
            fontSize: 10.5,
            margin: "14px 0 0",
            lineHeight: 1.8,
          }}
        >
          بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية — لا نشارك
          بياناتك مع أي طرف ثالث.
        </p>
      </div>
    </div>
  );
}
