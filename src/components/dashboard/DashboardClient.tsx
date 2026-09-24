"use client";

import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";

/* ============================================================
   DashboardClient — ترويسة ميثاق بالهوية الأسطورية
   لوح زمردي داكن متدرج مع النقشة الذهبية والشعار المتنفس
   وزر ذهبي — تماماً كواجهة النسخة v1 الأصلية.
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
  return (
    <header
      style={{
        maxWidth: 1020,
        margin: "0 auto",
        borderRadius: 30,
        padding: "30px 34px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        color: "#fff",
        background:
          "linear-gradient(135deg, rgba(7,31,26,0.98), rgba(29,74,62,0.96) 58%, rgba(46,109,92,0.92))",
        boxShadow: "var(--shadow)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* النقشة الذهبية الزخرفية في زاوية الترويسة */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 24,
          top: 20,
          width: 210,
          height: 210,
          opacity: 0.3,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'%3E%3Cg fill='none' stroke='%23F6D979' stroke-width='2' stroke-opacity='.46'%3E%3Cpath d='M110 10 134 82 210 110 134 138 110 210 86 138 10 110 86 82Z'/%3E%3Cpath d='M110 38 126 91 182 110 126 129 110 182 94 129 38 110 94 91Z'/%3E%3Ccircle cx='110' cy='110' r='48'/%3E%3C/g%3E%3C/svg%3E\")",
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flex: 1,
          minWidth: 240,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Logo height={52} />
        <div>
          <b
            style={{
              fontSize: 21,
              fontWeight: 900,
              display: "block",
              lineHeight: 1.2,
              color: "#fff",
            }}
          >
            منصة ميثاق للعقود الذكية
          </b>
          <small
            style={{ color: "rgba(255,255,255,0.72)", fontWeight: 800, fontSize: 12 }}
          >
            منظومة العقود والتوثيق الإلكتروني
            {mode === "user" && userName ? ` — مرحباً ${userName}` : ""}
          </small>
        </div>
      </div>

      {mode === "user" ? (
        <form action={signOutAction} style={{ position: "relative", zIndex: 1 }}>
          <button
            className="btn btn-soft"
            type="submit"
            style={{ padding: "10px 18px" }}
          >
            تسجيل الخروج
          </button>
        </form>
      ) : (
        <button
          className="btn"
          type="button"
          style={{ position: "relative", zIndex: 1, padding: "12px 22px" }}
          onClick={() => signIn("google", { callbackUrl: "/" })}
          title="سجّل الدخول لحفظ عقودك وتوقيعها إلكترونياً"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.7 4.1-5.35 4.1A6.1 6.1 0 1 1 16.2 7l2.2-2.1A9 9 0 1 0 21 12c0-.3 0-.6-.05-.9z"
            />
          </svg>
          تسجيل الدخول عبر Google
        </button>
      )}
    </header>
  );
}
