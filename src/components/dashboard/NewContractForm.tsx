"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_TYPES, contractTypeName } from "@/lib/contract-types";
import { buildContractContent } from "@/lib/contract-text";
import { arDate } from "@/lib/format";
import {
  saveGuestDraft,
  markPendingClaim,
  loadGuestDraft,
  clearGuestDraft,
  type GuestDraft,
} from "@/lib/guest-draft";
import ClausePickerModal from "./ClausePickerModal";
import LoginGateModal from "./LoginGateModal";

/* ============================================================
   NewContractForm — نموذج إنشاء العقد
   واجهة واحدة طبيعية للجميع: نفس العنوان والأزرار، بلا أي
   كلمات "تجربة/ضيف/بدون تسجيل". المسجل يحفظ مباشرة، والزائر
   عند الحفظ/الطباعة يُحفظ مسودته محلياً وتظهر نافذة الدخول
   الأنيقة، وبعد عودته تُستعاد بياناته وتُحفظ تلقائياً.
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

export type DashboardMode = "guest" | "user";

export type FormState = {
  type: string;
  signingMode: string;
  party1: string;
  party2: string;
  amount: string;
  city: string;
  country: string;
  subject: string;
  duration: string;
  paymentMethod: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
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
};

function formFromDraft(d: GuestDraft): FormState {
  return {
    type: d.type || EMPTY_FORM.type,
    signingMode: d.signingMode || "send",
    party1: d.party1 || "",
    party2: d.party2 || "",
    amount: d.amount || "",
    city: d.city || "",
    country: d.country || "",
    subject: d.subject || "",
    duration: d.duration || "",
    paymentMethod: d.paymentMethod || "",
    notes: d.notes || "",
  };
}

export default function NewContractForm({ mode }: { mode: DashboardMode }) {
  const router = useRouter();

  /* ===== الحالة ===== */
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [clauses, setClauses] = useState<string[]>([]);

  /* المودالات */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateAction, setGateAction] = useState<"save" | "print">("save");

  /* ===== استعادة المسودة المحفوظة (مرة واحدة عند التركيب) ===== */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const draft = loadGuestDraft();
    if (!draft) return;

    if (mode === "user") {
      /* عاد من الدخول — استعادة + حفظ فوري في Neon */
      (async () => {
        try {
          const res = await fetch("/api/contracts/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...draft }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok)
            throw new Error(data.message || "تعذر حفظ العقد");
          clearGuestDraft();
          setNotice("✅ تم حفظ عقدك في عقودك بنجاح");
          setOpen(false);
          router.refresh();
        } catch (e) {
          setForm(formFromDraft(draft));
          setClauses(draft.clauses || []);
          setOpen(true);
          setError(
            "⚠️ تعذر الحفظ التلقائي — بياناتك محفوظة، اضغط «حفظ العقد» لإعادة المحاولة"
          );
        }
      })();
    } else {
      /* زائر عاد دون دخول — نعيد تعبئة النموذج كي لا يفقد شيئاً */
      setForm(formFromDraft(draft));
      setClauses(draft.clauses || []);
      setOpen(true);
    }
  }, [mode, router]);

  /* ===== المعاينة الحية ===== */
  const preview = useMemo(() => {
    const cleanClauses = clauses.map((c) => c.trim()).filter(Boolean);
    return buildContractContent({
      type: form.type,
      party1Name: form.party1.trim() || "……",
      party2Name: form.party2.trim() || "……",
      amount: form.amount,
      city: form.city,
      subject: form.subject,
      duration: form.duration,
      paymentMethod: form.paymentMethod,
      notes: form.notes,
      clauses: cleanClauses.length ? cleanClauses : undefined,
      date: new Date(),
    });
  }, [form, clauses]);

  /* ===== مناولة الحقول ===== */
  function set(k: keyof FormState, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function payload() {
    return {
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
      clauses: clauses.map((c) => c.trim()).filter(Boolean),
    };
  }

  function basicValidation(): string {
    if (!form.party1.trim()) return "أدخل اسم الطرف الأول أولاً.";
    if (!form.party2.trim()) return "أدخل اسم الطرف الثاني أولاً.";
    return "";
  }

  /* ===== بوابة الحفظ: حفظ محلي + نافذة الدخول (للزائر) ===== */
  function gate(action: "save" | "print") {
    saveGuestDraft({
      ...form,
      clauses: clauses.map((c) => c.trim()).filter(Boolean),
    });
    markPendingClaim();
    setGateAction(action);
    setGateOpen(true);
  }

  /* ===== حفظ العقد ===== */
  async function submit() {
    setError("");
    setNotice("");
    const v = basicValidation();
    if (v) {
      setError(v);
      return;
    }
    if (mode === "guest") {
      gate("save");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.message || "تعذر إنشاء العقد");
      setOpen(false);
      setForm(EMPTY_FORM);
      setClauses([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /* ===== طباعة / PDF ===== */
  async function printContract() {
    setError("");
    setNotice("");
    const v = basicValidation();
    if (v) {
      setError(v);
      return;
    }
    if (mode === "guest") {
      gate("print");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.message || "تعذر إنشاء العقد للطباعة");
      const id: string | undefined = data.contract?.id;
      if (!id) throw new Error("تعذر تحديد العقد المحفوظ");
      window.location.assign(`/print/${id}`);
    } catch (e) {
      setError((e as Error).message);
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
          <b style={{ fontSize: 15 }}>عقد جديد</b>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "2px 0 0" }}>
            املأ البيانات واختر البنود — سيتولد نص العقد أمامك فوراً، ووقّعه
            رقمياً مع بصمة تحقق SHA-256.
          </p>
        </div>
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)}>
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

          {/* ===== البنود ===== */}
          <div style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <b style={{ fontSize: 13 }}>بنود العقد ({clauses.length})</b>
              <button
                className="btn btn-soft"
                type="button"
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => setPickerOpen(true)}
              >
                ＋ بنود جاهزة
              </button>
              <button
                className="btn btn-soft"
                type="button"
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => setClauses((cs) => [...cs, ""])}
              >
                ＋ بند مخصص
              </button>
              {clauses.length > 0 && (
                <button
                  className="btn btn-soft"
                  type="button"
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    color: "#b91c1c",
                  }}
                  onClick={() => setClauses([])}
                >
                  مسح الكل
                </button>
              )}
            </div>

            {clauses.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>
                ستُستخدم البنود الافتراضية لنوع العقد «
                {contractTypeName(form.type)}» تلقائياً.
              </p>
            )}

            {clauses.map((cl, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
              >
                <span
                  style={{
                    color: "var(--muted)",
                    fontSize: 12,
                    paddingTop: 10,
                    minWidth: 20,
                  }}
                >
                  {i + 1}.
                </span>
                <textarea
                  value={cl}
                  onChange={(e) => {
                    const v = e.target.value;
                    setClauses((cs) =>
                      cs.map((c, idx) => (idx === i ? v : c))
                    );
                  }}
                  rows={2}
                  maxLength={1000}
                  placeholder="نص البند — أي حقول بين [أقواس] تُعبأ تلقائياً من بيانات النموذج"
                  style={{ ...input, resize: "vertical", fontSize: 12.5 }}
                />
                <button
                  className="btn btn-soft"
                  style={{ padding: "6px 10px", fontSize: 11, color: "#b91c1c" }}
                  type="button"
                  onClick={() =>
                    setClauses((cs) => cs.filter((_, idx) => idx !== i))
                  }
                  title="حذف البند"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          {/* ===== المعاينة الحية ===== */}
          <details
            open
            style={{ borderTop: "1px dashed var(--line)", paddingTop: 12 }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 13 }}>
              👁️ معاينة العقد — تتحدث فورياً أثناء الكتابة
            </summary>
            <div
              className="box"
              style={{ marginTop: 10, maxHeight: 360, overflowY: "auto" }}
            >
              <b>{contractTypeName(form.type)}</b>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12.5,
                  marginTop: 6,
                  lineHeight: 1.9,
                }}
              >
                {preview}
              </div>
            </div>
            <small
              style={{
                color: "var(--muted)",
                fontSize: 10.5,
                display: "block",
                marginTop: 6,
              }}
            >
              النص النهائي يُبنى ويُختم بالبصمة في الخادم بنفس المنطق تماماً —
              التاريخ: {arDate(new Date())}
            </small>
          </details>

          {notice && (
            <p
              style={{
                color: "var(--green-2)",
                fontSize: 12.5,
                fontWeight: 700,
                margin: 0,
              }}
            >
              {notice}
            </p>
          )}
          {error && (
            <p
              style={{
                color: "#b91c1c",
                fontSize: 12.5,
                fontWeight: 700,
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "جاري…" : "💾 حفظ العقد"}
            </button>
            <button
              className="btn btn-soft"
              type="button"
              disabled={busy}
              onClick={printContract}
            >
              🖨️ طباعة / PDF
            </button>
          </div>
        </form>
      )}

      <ClausePickerModal
        open={pickerOpen}
        contractType={form.type}
        existingClauses={clauses}
        onClose={() => setPickerOpen(false)}
        onAdd={(chosen) => setClauses((cs) => [...cs, ...chosen])}
      />
      <LoginGateModal
        open={gateOpen}
        action={gateAction}
        onClose={() => setGateOpen(false)}
      />
    </section>
  );
}
