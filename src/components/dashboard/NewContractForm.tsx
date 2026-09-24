"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_TYPES } from "@/lib/contract-types";

/* ============================================================
   NewContractForm — زر ونموذج إنشاء عقد جديد
   متصل بـ POST /api/contracts (التحقق والبناء والبصمة في الخادم)
   بعد النجاح: router.refresh() ليقرأ الجدول العقود الجديدة من Neon
   ============================================================ */

type FieldStyle = React.CSSProperties;

const input: FieldStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1.5px solid var(--line)",
  borderRadius: 9,
  font: "inherit",
  background: "#fff",
};

const label: FieldStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--muted)",
  margin: "0 0 4px",
};

export default function NewContractForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    type: "lease",
    signingMode: "send",
    party1: "",
    party2: "",
    amount: "",
    city: "",
    country: "",
    subject: "",
    duration: "",
    paymentMethod: "",
    notes: "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          signingMode: form.signingMode,
          party1: form.party1.trim(),
          party2: form.party2.trim(),
          amount: form.amount.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
          subject: form.subject.trim(),
          duration: form.duration.trim(),
          paymentMethod: form.paymentMethod.trim(),
          notes: form.notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.message || "تعذر إنشاء العقد");
      setOpen(false);
      setForm((f) => ({
        type: f.type,
        signingMode: f.signingMode,
        party1: "",
        party2: "",
        amount: "",
        city: "",
        country: "",
        subject: "",
        duration: "",
        paymentMethod: "",
        notes: "",
      }));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: "16px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <b style={{ fontSize: 15 }}>عقودي</b>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "2px 0 0" }}>
            أنشئ عقداً جديداً ووقّعه رقمياً مع بصمة تحقق SHA-256.
          </p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "✕ إغلاق النموذج" : "＋ عقد جديد"}
        </button>
      </div>

      {open && (
        <form
          style={{ marginTop: 16, display: "grid", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid2">
            <div>
              <label style={label}>نوع العقد *</label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                style={input}
              >
                {Object.entries(CONTRACT_TYPES).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>وضع التوقيع</label>
              <select
                value={form.signingMode}
                onChange={(e) => set("signingMode", e.target.value)}
                style={input}
              >
                <option value="send">إرسال للطرف الثاني عبر الرابط</option>
                <option value="quick">توقيع سريع على نفس الجهاز</option>
              </select>
            </div>
            <div>
              <label style={label}>الطرف الأول *</label>
              <input
                value={form.party1}
                onChange={(e) => set("party1", e.target.value)}
                maxLength={120}
                placeholder="اسم المؤجر / البائع / مقدم الخدمة"
                style={input}
              />
            </div>
            <div>
              <label style={label}>الطرف الثاني *</label>
              <input
                value={form.party2}
                onChange={(e) => set("party2", e.target.value)}
                maxLength={120}
                placeholder="اسم المستأجر / المشتري / المستفيد"
                style={input}
              />
            </div>
          </div>

          <div className="grid2">
            <div>
              <label style={label}>القيمة / المبلغ</label>
              <input
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                maxLength={120}
                placeholder="مثال: 500,000 ل.س"
                style={input}
              />
            </div>
            <div>
              <label style={label}>المدينة</label>
              <input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                maxLength={80}
                placeholder="دمشق"
                style={input}
              />
            </div>
            <div>
              <label style={label}>الدولة</label>
              <input
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                maxLength={80}
                style={input}
              />
            </div>
            <div>
              <label style={label}>مدة العقد</label>
              <input
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
                maxLength={120}
                placeholder="سنة واحدة"
                style={input}
              />
            </div>
          </div>

          <div>
            <label style={label}>موضوع العقد</label>
            <input
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              maxLength={200}
              placeholder="وصف موجز لموضوع العقد"
              style={input}
            />
          </div>

          <div>
            <label style={label}>طريقة السداد</label>
            <input
              value={form.paymentMethod}
              onChange={(e) => set("paymentMethod", e.target.value)}
              maxLength={120}
              placeholder="شهري / دفعة واحدة"
              style={input}
            />
          </div>

          <div>
            <label style={label}>ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={2000}
              rows={3}
              style={{ ...input, resize: "vertical" }}
            />
          </div>

          {error && (
            <p style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 700, margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "جاري الإنشاء…" : "إنشاء العقد"}
          </button>
          </div>
        </form>
      )}
    </section>
  );
}
