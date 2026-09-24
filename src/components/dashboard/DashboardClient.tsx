"use client";

import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";

/* ============================================================
   DashboardClient — ترويسة المنصة (موحّدة للجميع)
   واجهة طبيعية واحدة: الشعار + الاسم + زر دخول للزائر أو
   مرحباً + خروج للمسجل — بلا أي أشرطة "تجربة/ضيف".
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
          منصة ميثاق للعقود الذكية
        </b>
        <small style={{ color: "var(--muted)", fontSize: 11 }}>
          منظومة العقود والتوثيق الإلكتروني
          {mode === "user" && userName ? ` — مرحباً ${userName}` : ""}
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
          className="btn btn-soft"
          type="button"
          style={{ padding: "9px 16px", fontSize: 12.5 }}
          onClick={() => signIn("google", { callbackUrl: "/" })}
          title="سجّل الدخول لحفظ عقودك وتوقيعها إلكترونياً"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.7 4.1-5.35 4.1A6.1 6.1 0 1 1 16.2 7l2.2-2.1A9 9 0 1 0 21 12c0-.3 0-.6-.05-.9z"
            />
          </svg>
          تسجيل الدخول
        </button>
      )}
    </header>
  );
}
