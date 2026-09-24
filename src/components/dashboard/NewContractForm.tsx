"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_TYPES, contractTypeName } from "@/lib/contract-types";
import { resolveClauses, buildContractContent } from "@/lib/contract-text";
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
   NewContractForm — نموذج إنشاء العقد (Guest-First)
   - متاح بالكامل للضيف: تعبئة + اختيار بنود + معاينة ديناميكية حية
   - «حفظ في قاعدة البيانات» أو «طباعة PDF» للضيف:
       1) تُحفظ المسودة في LocalStorage
       2) تظهر نافذة أنيقة تطلب الدخول عبر Google
       3) بعد العودة: استعادة تلقائية + حفظ فوري في Neon عبر
          POST /api/contracts/restore (يرجع العقد إلى الجدول)
   - للمسجل: نفس الأزرار تعمل فوراً وبشكل طبيعي
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
  const [open, setOpen] = useState(() => mode === "guest");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [clauses, setClauses] = useState<string[]>([]);

  /* المودالات */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateAction, setGateAction] = useState<"save" | "print">("save");

  /* ===== استعادة مسودة الضيف (مرة واحدة عند التركيب) ===== */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const draft = loadGuestDraft();
    if (!draft) return;

    if (mode === "user") {
      /* عاد من Google مسجلاً — استعادة + حفظ فوري في Neon */
      (async () => {
        try {
          const res = await fetch("/api/contracts/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...draft }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok)
            throw new Error(data.message || "تعذر حفظ مسودتك");
          clearGuestDraft();
          setNotice("✅ تم استعادة مسودتك وحفظها في عقودك بنجاح");
          setOpen(false);
          router.refresh();
        } catch (e) {
          /* فشل الاستعادة — نعيد فتح النموذج معبأ كي لا يفقد المستخدم شيئاً */
          setForm(formFromDraft(draft));
          setClauses(draft.clauses || []);
          setOpen(true);
          setNotice("");
          setError(
            "⚠️ " +
              ((e as Error).message ||
                "تعذر الحفظ التلقائي — بياناتك محفوظة على جهازك، اضغط «حفظ» لإعادة المحاولة")
          );
        }
      })();
    } else {
      /* ضيف عاد دون تسجيل — نعيد تعبئة النموذج كي لا يفقد شيئاً */
      setForm(formFromDraft(draft));
      setClauses(draft.clauses || []);
      setOpen(true);
      setNotice("♻️ استعدنا مسودتك المحفوظة على جهازك — أكمل حيث توقفت");
    }
  }, [mode, router]);

  /* ===== المعاينة الديناميكية الحية ===== */
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

  const liveClauseCount = useMemo(() => {
    const clean = clauses.map((c) => c.trim()).filter(Boolean);
    if (clean.length) return clean.length;
    return resolveClauses({
      type: form.type,
      party1Name: form.party1,
      party2Name: form.party2,
      amount: form.amount,
      city: form.city,
      subject: form.subject,
      duration: form.duration,
      paymentMethod: form.paymentMethod,
      date: new Date(),
    }).length;
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

  /* تحقق خفيف قبل فتح بوابة الدخول أو الإرسال */
  function basicValidation(): string {
    if (!form.party1.trim()) return "أدخل اسم الطرف الأول أولاً.";
    if (!form.party2.trim()) return "أدخل اسم الطرف الثاني أولاً.";
    return "";
  }

  /* ===== بوابة الضيف: حفظ محلي + نافذة تسجيل الدخول ===== */
  function guestGate(action: "save" | "print") {
    saveGuestDraft({ ...form, clauses: clauses.map((c) => c.trim()).filter(Boolean) });
    markPendingClaim();
    setGateAction(action);
    setGateOpen(true);
  }

  /* ===== حفظ في قاعدة البيانات ===== */
  async function submit() {
    setError("");
    const v = basicValidation();
    if (v) {
      setError(v);
      return;
    }
    if (mode === "guest") {
      guestGate("save");
      setNotice("💾 حفظنا مسودتك على جهازك — سجّل الدخول لإتمام الحفظ في عقودك");
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
    const v = basicValidation();
    if (v) {
      setError(v);
      return;
    }
    if (mode === "guest") {
      guestGate("print");
      setNotice("💾 حفظنا مسودتك على جهازك — بعد الدخول ستجد زر الطباعة في جدول عقودك");
      return;
    }
    setBusy(true);
    try {
      /* للمسجل: حفظ ثم فتح نسخة A4 القابلة للطباعة/PDF مباشرة */
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
          <b style={{ fontSize: 15 }}>
            {mode === "guest"
              ? "جرّب المنصة — أنشئ عقدك الآن بدون تسجيل"
              : "عقودي — عقد جديد"}
          </b>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "2px 0 0" }}>
            {mode === "guest"
              ? "عبّئ النموذج واختر البنود وشاهد مسودة عقدك تتولد أمامك — الحفظ الدائم والطباعة يتطلبان دخولاً سريعاً بـ Google"
              : "أنشئ عقداً جديداً ووقّعه رقمياً مع بصمة تحقق SHA-256."}
          </p>
        </div>
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)}>
          {open
            ? "✕ إغلاق النموذج"
            : mode === "guest"
              ? "✍️ ابدأ عقدك الآن — مجاناً"
              : "＋ عقد جديد"}
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
              <b style={{ fontSize: 13 }}>
                بنود العقد ({clauses.length})
                <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 11 }}>
                  {" "}
                  — ستُظهر المسودة {liveClauseCount} بنداً
                </span>
              </b>
              <button
                className="btn btn-soft"
                type="button"
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => setPickerOpen(true)}
              >
                ＋ بنود جاهزة (محررة قانونياً)
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
                لا بنود مخصصة — سنستخدم البنود الافتراضية لنوع العقد
                «{contractTypeName(form.type)}» تلقائياً في المعاينة والحفظ.
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

          {/* ===== المعاينة الديناميكية ===== */}
          <details
            open
            style={{ borderTop: "1px dashed var(--line)", paddingTop: 12 }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 13 }}>
              👁️ معاينة مسودة العقد — تتحدث فورياً أثناء الكتابة
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
              {busy
                ? "جاري…"
                : mode === "guest"
                  ? "💾 حفظ العقد في قاعدة البيانات"
                  : "💾 حفظ العقد"}
            </button>
            <button
              className="btn btn-soft"
              type="button"
              disabled={busy}
              onClick={printContract}
            >
              🖨️ طباعة العقد وتحميله كـ PDF
            </button>
            {mode === "guest" && (
              <small
                style={{
                  color: "var(--muted)",
                  fontSize: 11,
                  alignSelf: "center",
                }}
              >
                الحفظ الدائم يحتاج دخولاً سريعاً — بياناتك تبقى محفوظة على جهازك
                ولن تضيع
              </small>
            )}
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
