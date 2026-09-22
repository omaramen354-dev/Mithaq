"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div className="card" style={{ maxWidth: 420, padding: 28, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900 }}>
          مِــيــثَــاق
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 22px" }}>
          منصة العقود والتوثيق الإلكتروني — سجّل الدخول للمتابعة
        </p>
        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.7 4.1-5.35 4.1A6.1 6.1 0 1 1 16.2 7l2.2-2.1A9 9 0 1 0 21 12c0-.3 0-.6-.05-.9z" />
          </svg>
          الدخول عبر Google
        </button>
      </div>
    </main>
  );
}
