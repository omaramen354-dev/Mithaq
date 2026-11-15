"use client";

import { useState } from "react";

/* زر نقرة واحدة داخل تنبيه قاعدة البيانات في /admin لإنشاء ومزامنة أي جدول/عمود ناقص في Neon */
export default function DbSyncButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runSync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/db-sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (res.ok && data.ok) {
        setMsg({ ok: true, text: data.message || "تمت المزامنة بنجاح!" });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setMsg({ ok: false, text: data.message || "تعذّرت المزامنة." });
      }
    } catch {
      setMsg({ ok: false, text: "تعذر الاتصال بالخادم." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={runSync}
        disabled={busy}
      >
        <i className={busy ? "fas fa-spinner fa-spin" : "fas fa-wrench"} />
        {busy ? "جارٍ إنشاء وتحديث جداول Neon..." : "إصلاح ومزامنة جداول Neon الآن (نقرة واحدة)"}
      </button>
      {msg && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: msg.ok ? "#0f5132" : "#a93226",
          }}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
