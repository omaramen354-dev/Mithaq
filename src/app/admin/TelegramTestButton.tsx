"use client";

import { useState } from "react";

/* زر صغير في رأس /admin لإرسال رسالة اختبار فورية إلى بوت تيليجرام */
export default function TelegramTestButton() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendTest() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/telegram-test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setNotice({
        ok: Boolean(res.ok && data.ok),
        text: data.message || (res.ok ? "تم الإرسال!" : "تعذر الإرسال."),
      });
    } catch {
      setNotice({ ok: false, text: "تعذر الاتصال بالخادم." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-outline"
        onClick={sendTest}
        disabled={busy}
        title="تفعيل أزرار تيليجرام المباشرة وإرسال رسالة اختبار"
      >
        <i className={busy ? "fas fa-spinner fa-spin" : "fas fa-paper-plane"} />
        {busy ? "جارٍ التفعيل..." : "تفعيل واختبار تيليجرام"}
      </button>
      {notice && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 999,
            background: notice.ok ? "#e9f6ee" : "#fdeeee",
            color: notice.ok ? "#157347" : "#a93226",
            border: `1px solid ${notice.ok ? "#bfe3cd" : "#f2c6c6"}`,
          }}
        >
          {notice.text}
        </span>
      )}
    </div>
  );
}
