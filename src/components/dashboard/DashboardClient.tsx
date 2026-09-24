"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";

/* ============================================================
   DashboardClient — ترويسة اللوحة + شريط الضيف الترحيبي
   - وضع الضيف: زر دخول Google + شريط لطيف يظهر مرة واحدة
     (يختفي للأجهزة التي أنشأت عقد ضيف سابقاً — عبر /api/guest-prompt
     المبني على بصمة IP، فلا نكرر الإزعاج لنفس الزائر)
   - وضع المسجل: مرحباً + تسجيل الخروج (Server Action ممرَّرة من page)
   ============================================================ */

export default function DashboardClient({
  mode,
  userName,
  signOutAction,
}: {
  mode: "guest" | "user";
  userName?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [showGuestBanner, setShowGuestBanner] = useState(false);

  /* شريط الترحيب للضيف — مرة واحدة لكل زائر (بصمة IP) */
  useEffect(() => {
    if (mode !== "guest") return;
    let cancelled = false;
    fetch("/api/guest-prompt")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.showPrompt) setShowGuestBanner(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <>
      <header
        className="card"
        style={{
          maxWidth: 1020,
          padding: "16px 22px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Logo height={30} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <b style={{ fontSize: 16, fontWeight: 900, display: "block" }}>
            لوحة إدارة العقود
          </b>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            منظومة العقود والتوثيق الإلكتروني{" "}
            {mode === "user"
              ? `— مرحباً ${userName || "بك"}`
              : "— تجربة مجانية للزوار بدون تسجيل"}
          </small>
        </div>

        {mode === "user" ? (
          <form action={signOutAction}>
            <button className="btn btn-soft" type="submit">
              تسجيل الخروج
            </button>
          </form>
        ) : (
          <button
            className="btn"
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#fff"
                d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.7 4.1-5.35 4.1A6.1 6.1 0 1 1 16.2 7l2.2-2.1A9 9 0 1 0 21 12c0-.3 0-.6-.05-.9z"
              />
            </svg>
            الدخول عبر Google
          </button>
        )}
      </header>

      {mode === "guest" && showGuestBanner && (
        <div
          style={{
            maxWidth: 1020,
            margin: "10px auto 0",
            padding: "12px 18px",
            borderRadius: 14,
            border: "1px solid #d8ead9",
            background:
              "linear-gradient(90deg, #f2f8f4 0%, #fdf9ef 100%)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 12.5,
          }}
        >
          <span style={{ fontSize: 18 }}>🧪</span>
          <span style={{ flex: 1, minWidth: 240, lineHeight: 1.8 }}>
            <b>أنت في وضع التجربة (ضيف):</b> ابنِ عقدك كاملاً وشاهده يتولّد
            أمامك. عند الحفظ أو الطباعة سنحفظ مسودتك على جهازك ونطلب منك دخولاً
            سريعاً بـ Google <b>مرة واحدة فقط</b> — لن نكرر الطلب.
          </span>
          <button
            className="btn btn-soft"
            type="button"
            style={{ padding: "7px 14px", fontSize: 12 }}
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            حفظ عقودي — دخول سريع
          </button>
          <button
            className="btn btn-soft"
            type="button"
            style={{ padding: "7px 12px", fontSize: 12 }}
            onClick={() => setShowGuestBanner(false)}
            title="إخفاء"
          >
            لاحقاً
          </button>
        </div>
      )}
    </>
  );
}
