"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";
import { loadGuestDraft } from "@/lib/guest-draft";

/* ============================================================
   صفحة /login — بالهوية الأسطورية (عاجي + زمردي + ذهبي)
   إذا وصل الزائر من بوابة الحفظ/الطباعة فمسودته محفوظة
   محلياً وستستعاد تلقائياً بعد الدخول.
   ============================================================ */

export default function LoginPage() {
  const [draftInfo, setDraftInfo] = useState<{
    party1: string;
    party2: string;
  } | null>(null);

  useEffect(() => {
    const d = loadGuestDraft();
    if (d && (d.party1 || d.party2)) {
      setDraftInfo({ party1: d.party1, party2: d.party2 });
    }
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 430,
          padding: 30,
          textAlign: "center",
          borderRadius: 30,
          border: "1px solid rgba(212, 168, 67, 0.45)",
          boxShadow: "0 34px 80px rgba(0,0,0,0.22)",
        }}
      >
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

        <h1
          style={{
            margin: "8px 0 6px",
            fontSize: 19,
            fontWeight: 900,
            color: "var(--green)",
          }}
        >
          منصة العقود الذكية العربية
        </h1>
        <p
          style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 22px" }}
        >
          منظومة العقود والتوثيق الإلكتروني — سجّل الدخول للمتابعة
        </p>

        {draftInfo && (
          <div
            style={{
              textAlign: "right",
              fontSize: 12,
              background: "linear-gradient(135deg, #fff7d8, #fffdf6)",
              border: "1px solid rgba(212, 168, 67, 0.4)",
              borderRadius: 14,
              padding: "11px 14px",
              margin: "0 0 16px",
              lineHeight: 1.8,
            }}
          >
            💾 لديك مسودة عقد محفوظة على هذا الجهاز
            {draftInfo.party1 ? (
              <>
                {" "}
                (الطرف الأول: <b>{draftInfo.party1}</b>
                {draftInfo.party2 ? (
                  <>
                    {" "}
                    — الطرف الثاني: <b>{draftInfo.party2}</b>
                  </>
                ) : null}
              </>
            ) : null}
            . بعد الدخول سنحفظها في عقودك <b>تلقائياً</b>.
          </div>
        )}

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center", padding: "13px 18px" }}
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.7 4.1-5.35 4.1A6.1 6.1 0 1 1 16.2 7l2.2-2.1A9 9 0 1 0 21 12c0-.3 0-.6-.05-.9z"
            />
          </svg>
          الدخول عبر Google
        </button>

        <p style={{ color: "var(--muted)", fontSize: 11.5, margin: "15px 0 0" }}>
          <a
            href="/"
            style={{ color: "var(--green)", fontWeight: 900 }}
          >
            ← متابعة إلى المنصة
          </a>
        </p>
      </div>
    </main>
  );
}
