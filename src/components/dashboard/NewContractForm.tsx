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
import SaveSuccessModal from "./SaveSuccessModal";

/* ============================================================
   NewContractForm — نموذج إنشاء العقد (الهوية الأسطورية)
   حقول عاجية بتركيز ذهبي + أزرار ذهبية — نفس منطق الحفظ
   والاستعادة السابق دون أي تغيير.
   ============================================================ */

type FieldStyle = React.CSSProperties;

const input: FieldStyle = {
  width: "100%",
  minHeight: 44,
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 14,
  font: "inherit",
  background: "#fffefa",
  outline: "none",
  transition: "0.2s var(--ease)",
};

const label: FieldStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: "var(--green)",
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

export default function NewContractForm({
  mode,
  presetType,
}: {
  mode: DashboardMode;
  presetType?: string;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState>(
    presetType && CONTRACT_TYPES[presetType]
      ? { ...EMPTY_FORM, type: presetType }
      : EMPTY_FORM
  );
  const [clauses, setClauses] = useState<string[]>([]);

  /* استقبال نوع مختار من بطاقات القوالب (نافذة الأسفل تستمع لحدث مخصص) */
  useEffect(() => {
    const onPick = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (t && CONTRACT_TYPES[t]) {
        setForm((f) => ({ ...f, type: t }));
        setOpen(true);
      }
    };
    window.addEventListener("mithaq:pick-type", onPick);
    return () => window.removeEventListener("mithaq:pick-type", onPick);
  }, []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateAction, setGateAction] = useState<"save" | "print">("save");

  /* شاشة النجاح بعد الحفظ: العقد المحفوظ + رابط المشاركة */
  const [saved, setSaved] = useState<{
    contract: {
      id: string;
      type: string;
      party1Name: string;
      party2Name: string;
      status: string;
      contentHash?: string | null;
      updatedAt?: string | Date | null;
    };
    shareUrl: string;
  } | null>(null);

  /* ===== استعادة المسودة المحفوظة (مرة واحدة) ===== */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const draft = loadGuestDraft();
    if (!draft) return;

    if (mode === "user") {
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

  function gate(action: "save" | "print") {
    saveGuestDraft({
      ...form,
      clauses: clauses.map((c) => c.trim()).filter(Boolean),
    });
    markPendingClaim();
    setGateAction(action);
    setGateOpen(true);
  }

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
      /* شاشة النجاح: البصمة + رابط المشاركة + واتساب */
      if (data.contract && data.shareUrl) {
        setSaved({ contract: data.contract, shareUrl: data.shareUrl });
      }
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
    <section
      className="card"
      style={{
        padding: "24px 26px",
        borderRadius: 20,
        border: "1.5px solid rgba(212,168,67,0.3)",
        boxShadow: "var(--shadow)",
      }}
    >
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
          <b style={{ fontSize: 17, color: "var(--green)", fontWeight: 900 }}>
            عقد جديد
          </b>
          <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "3px 0 0" }}>
            املأ البيانات واختر البنود — سيتولد نص العقد أمامك فوراً ببصمة تحقق
            SHA-256.
          </p>
        </div>
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)}>
          {open ? "✕ إغلاق النموذج" : "＋ عقد جديد"}
        </button>
      </div>

      <hr className="gold-rule" />

      {open && (
        <form
          style={{ display: "grid", gap: 13 }}
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
                style={{ ...input, padding: 0 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
                style={{ ...input, padding: 0 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
              />
            </div>
            <div>
              <label style={label}>الدولة</label>
              <input
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                maxLength={80}
                style={input}
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
                onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
              onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
              onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
            />
          </div>

          <div>
            <label style={label}>ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={2000}
              rows={3}
              style={{ ...input, padding: 12, resize: "vertical" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
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
              <b style={{ fontSize: 13.5, color: "var(--green)" }}>
                بنود العقد ({clauses.length})
              </b>
              <button
                className="btn btn-soft"
                type="button"
                style={{ padding: "7px 14px", fontSize: 12 }}
                onClick={() => setPickerOpen(true)}
              >
                ＋ بنود جاهزة
              </button>
              <button
                className="btn btn-soft"
                type="button"
                style={{ padding: "7px 14px", fontSize: 12 }}
                onClick={() => setClauses((cs) => [...cs, ""])}
              >
                ＋ بند مخصص
              </button>
              {clauses.length > 0 && (
                <button
                  className="btn btn-soft"
                  type="button"
                  style={{
                    padding: "7px 14px",
                    fontSize: 12,
                    color: "var(--red)",
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
                    color: "var(--gold)",
                    fontSize: 13,
                    fontWeight: 900,
                    paddingTop: 10,
                    minWidth: 22,
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
                  style={{ ...input, padding: 12, resize: "vertical", fontSize: 12.5 }}
                />
                <button
                  className="btn btn-soft"
                  style={{ padding: "7px 10px", fontSize: 11, color: "var(--red)" }}
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
            style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 13.5,
                color: "var(--green)",
              }}
            >
              👁️ معاينة العقد — تتحدث فورياً أثناء الكتابة
            </summary>
            <div
              className="box"
              style={{
                marginTop: 10,
                maxHeight: 380,
                overflowY: "auto",
                borderRadius: 18,
                border: "1px solid rgba(212,168,67,0.35)",
                background:
                  "linear-gradient(180deg, #fffdf6, #fcfaf2)",
              }}
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
                fontWeight: 800,
                margin: 0,
              }}
            >
              {notice}
            </p>
          )}
          {error && (
            <p
              style={{
                color: "var(--red)",
                fontSize: 12.5,
                fontWeight: 800,
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="submit"
              disabled={busy}
              style={{ padding: "12px 24px", fontSize: 13.5 }}
            >
              {busy ? "جاري…" : "💾 حفظ العقد"}
            </button>
            <button
              className="btn btn-soft"
              type="button"
              disabled={busy}
              onClick={printContract}
              style={{ padding: "12px 24px", fontSize: 13.5 }}
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

      {saved && (
        <SaveSuccessModal
          contract={saved.contract}
          shareUrl={saved.shareUrl}
          onClose={() => setSaved(null)}
        />
      )}
    </section>
  );
}
