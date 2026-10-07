"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACT_TYPES, contractTypeName } from "@/lib/contract-types";
import { buildContractContent } from "@/lib/contract-text";
import {
  CURRENCIES,
  COUNTRIES,
  CITIES,
  PAYMENT_METHODS,
  findCurrency,
  countryByCode,
  countryOfCity,
  paymentFind,
  normAr,
  currencyTxt,
  durPhrase,
  durUnitLabel,
  parseDur,
  parseMoney,
  cleanMoney,
  numCanon,
  todayISO,
  MONTHS_AR,
  WEEK_AR,
  WEEK_SHORT,
  type DurUnit,
} from "@/lib/contract-form-data";
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
import { DEFAULT_CLAUSES } from "@/lib/clauses";

/* ============================================================
   ContractModal — نافذة إنشاء العقد المنبثقة (نفس النسخة القديمة)
   ترويسة زمردية بخط ذهبي + شريط المراحل + حقول متطورة بقوائم
   منبثقة: العملة، منتقي التاريخ، الدولة ← المدينة، المدة (رقم + وحدة)
   وطريقة السداد — مع نفس منطق NewContractForm (مسودة الضيف، بوابة
   الدخول، الحفظ عبر /api/contracts وبصمة SHA-256).
   ============================================================ */

type DashboardMode = "guest" | "user";
type PopKind = "currency" | "date" | "country" | "city" | "duration" | "payment" | null;
type Hint = { text: string; bad: boolean } | null;

export default function ContractModal({ mode }: { mode: DashboardMode }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState<PopKind>(null);
  const [popUp, setPopUp] = useState(false);

  /* ===== حالة النموذج ===== */
  const [type, setType] = useState("lease");
  const [signingMode, setSigningMode] = useState("send");
  const [party1, setParty1] = useState("");
  const [party2, setParty2] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [clauses, setClauses] = useState<string[]>([]);

  /* المبلغ + العملة */
  const [amountInput, setAmountInput] = useState("");
  const [curCode, setCurCode] = useState("USD");
  const lastAmountRef = useRef("");

  /* المدة (رقم + وحدة) */
  const [durInput, setDurInput] = useState("");
  const [durUnit, setDurUnit] = useState<DurUnit>("month");
  const lastDurRef = useRef("");

  /* التاريخ */
  const [date, setDate] = useState("");
  const [dateView, setDateView] = useState<Date>(new Date());

  /* الدولة والمدينة */
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [cityCustom, setCityCustom] = useState(false);
  const [countryQ, setCountryQ] = useState("");
  const [cityQ, setCityQ] = useState("");

  /* طريقة السداد */
  const [payment, setPayment] = useState("");
  const [paymentCustom, setPaymentCustom] = useState(false);
  const [paymentQ, setPaymentQ] = useState("");

  /* تلميحات الحقول */
  const [amountCustomHint, setAmountCustomHint] = useState("");
  const [durCustomHint, setDurCustomHint] = useState("");

  /* ===== حالات الحفظ ===== */
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateAction, setGateAction] = useState<"save" | "print">("save");
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

  const cur = findCurrency(curCode);
  const country = countryByCode(countryCode);

  /* ===== قيم مركبة (النص النهائي للمدة والمبلغ) ===== */
  const amountClean = cleanMoney(amountInput);
  const amountValid =
    !amountInput || (isFinite(Number(amountClean)) && Number(amountClean) > 0);
  const amountValue = !amountInput
    ? ""
    : amountValid
      ? numCanon(amountClean) + " " + currencyTxt(cur)
      : lastAmountRef.current;

  const durN = Number(durInput);
  const durValid =
    !durInput || (/^\d+$/.test(durInput) && durN >= 1 && durN <= 9999);
  const durValue = !durInput
    ? ""
    : durValid
      ? durPhrase(durN, durUnit)
      : lastDurRef.current;

  /* تثبيت آخر قيمة صالحة للمسودة */
  useEffect(() => {
    if (amountInput && amountValid) lastAmountRef.current = amountValue;
  }, [amountInput, amountValid, amountValue]);
  useEffect(() => {
    if (durInput && durValid) lastDurRef.current = durValue;
  }, [durInput, durValid, durValue]);

  const amountHint: Hint = amountCustomHint
    ? { text: amountCustomHint, bad: false }
    : amountInput && !amountValid
      ? { text: "أدخل مبلغاً صحيحاً أكبر من صفر (منزلتان عشريتان كحد أقصى).", bad: true }
      : null;
  const durHint: Hint = durCustomHint
    ? { text: durCustomHint, bad: false }
    : durInput && !durValid
      ? { text: "أدخل رقماً صحيحاً بين 1 و 9999.", bad: true }
      : null;

  /* ===== تصفير كامل (نفس openContractModal: فتح جديد = نموذج فارغ) ===== */
  function resetAll() {
    setType("lease");
    setSigningMode("send");
    setParty1("");
    setParty2("");
    setSubject("");
    setNotes("");
    setClauses([]);
    setAmountInput("");
    setCurCode("USD");
    setDurInput("");
    setDurUnit("month");
    setDate(todayISO());
    setDateView(new Date());
    setCountryCode("");
    setCity("");
    setCityCustom(false);
    setPayment("");
    setPaymentCustom(false);
    setAmountCustomHint("");
    setDurCustomHint("");
    lastAmountRef.current = "";
    lastDurRef.current = "";
    setError("");
    setNotice("");
    setPop(null);
  }

  /* ===== تعبئة النموذج من مسودة (استرجاع/استعادة) ===== */
  function fillFromDraft(d: GuestDraft) {
    setType(CONTRACT_TYPES[d.type] ? d.type : "lease");
    setSigningMode(d.signingMode === "quick" ? "quick" : "send");
    setParty1(d.party1 || "");
    setParty2(d.party2 || "");
    setSubject(d.subject || "");
    setNotes(d.notes || "");
    setClauses(d.clauses || []);

    /* المبلغ المحفوظ "500000 ليرة سورية" → حقل + عملة */
    const mp = parseMoney(d.amount || "");
    setAmountCustomHint("");
    if (mp.kind === "ok") {
      setCurCode(mp.code);
      setAmountInput(mp.n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
      lastAmountRef.current = numCanon(String(mp.n)) + " " + currencyTxt(findCurrency(mp.code));
    } else if (mp.kind === "custom") {
      setAmountInput("");
      lastAmountRef.current = d.amount || "";
      setAmountCustomHint(`قيمة محفوظة سابقاً: «${d.amount}» — ستبقى كما هي حتى تعديل الحقل.`);
    } else {
      setAmountInput("");
      setCurCode("USD");
      lastAmountRef.current = "";
    }

    /* المدة المحفوظة "6 أشهر" → رقم + وحدة */
    const dp = parseDur(d.duration || "");
    setDurCustomHint("");
    if (dp.kind === "ok") {
      setDurUnit(dp.u);
      setDurInput(String(dp.n));
      lastDurRef.current = durPhrase(dp.n, dp.u);
    } else if (dp.kind === "custom") {
      setDurInput("");
      setDurUnit("month");
      lastDurRef.current = d.duration || "";
      setDurCustomHint(`قيمة محفوظة سابقاً: «${d.duration}» — ستبقى كما هي حتى تعديل الحقل.`);
    } else {
      setDurInput("");
      setDurUnit("month");
      lastDurRef.current = "";
    }

    /* الدولة والمدينة */
    const byCity = countryOfCity(d.city || "");
    const code =
      d.country && countryByCode(d.country)
        ? d.country
        : byCity || "";
    setCountryCode(code);
    const c = d.city || "";
    setCity(c);
    setCityCustom(!!c && !(code && (CITIES[code] || []).includes(c)));

    /* طريقة السداد */
    const pm = paymentFind(d.paymentMethod || "");
    if (pm) {
      setPayment(pm.v);
      setPaymentCustom(false);
    } else if (d.paymentMethod) {
      setPayment(d.paymentMethod);
      setPaymentCustom(true);
    } else {
      setPayment("");
      setPaymentCustom(false);
    }

    setDate(todayISO());
    setError("");
    setNotice("");
    setPop(null);
  }

  /* ===== قفل تمرير الصفحة عند فتح المودال ===== */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("mithaq-modal-open");
    return () => {
      document.body.style.overflow = "";
      document.documentElement.classList.remove("mithaq-modal-open");
    };
  }, [open]);

  /* ===== حدث الفتح من الأزرار (هيرو/سايدبار/توب بار) + اختيار النوع =====
     عند اختيار نوع العقد تُملأ البنود الافتراضية تلقائياً في حقل البنود
     ليحرّرها المستخدم مباشرة بدل تركها مخفية في الخادم */
  useEffect(() => {
    const onOpen = () => {
      resetAll();
      setOpen(true);
    };
    const onPick = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (t && CONTRACT_TYPES[t]) {
        setType(t);
        setClauses(DEFAULT_CLAUSES[t] ? [...DEFAULT_CLAUSES[t]] : []);
        setOpen(true);
      }
    };
    window.addEventListener("mithaq:open-contract-modal", onOpen);
    window.addEventListener("mithaq:pick-type", onPick);
    return () => {
      window.removeEventListener("mithaq:open-contract-modal", onOpen);
      window.removeEventListener("mithaq:pick-type", onPick);
    };
  }, []);

  /* ===== استعادة مسودة الضيف عند أول تحميل (مثل NewContractForm) ===== */
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
          /* الفلو كالنسخة القديمة: المسودة المستعادة تُفتح صفحة التوقيع مباشرة */
          if (data.contract?.id) {
            window.location.assign(`/sign/${data.contract.id}`);
            return;
          }
          router.refresh();
        } catch {
          fillFromDraft(draft);
          setOpen(true);
          setError(
            "⚠️ تعذر الحفظ التلقائي — بياناتك محفوظة، اضغط «توليد العقد» لإعادة المحاولة"
          );
        }
      })();
    } else {
      fillFromDraft(draft);
      setOpen(true);
    }
  }, [mode, router]);

  /* ===== إغلاق القوائم بالنقر الخارجي + Escape ===== */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest && t.closest("[data-mq-field]")) return;
      setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pop) setPop(null);
        else setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, pop]);

  /* ===== فتح قائمة: تحديد الاتجاه (أسفل/أعلى) حسب المساحة ===== */
  function togglePop(kind: Exclude<PopKind, null>) {
    setPop((p) => {
      if (p === kind) return null;
      const el = document.querySelector(`[data-mq-field="${kind}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setPopUp(
          window.innerHeight - r.bottom < 350 && r.top > 380
        );
      }
      /* تصفير بحث القائمة المفتوحة */
      if (kind === "country") setCountryQ("");
      if (kind === "city") setCityQ("");
      if (kind === "payment") setPaymentQ("");
      return kind;
    });
  }

  /* ===== تغيير الدولة يفرّغ المدينة إن لم تعد تتبعها ===== */
  function commitCountry(code: string) {
    setCountryCode(code);
    if (city && countryOfCity(city) !== code) {
      setCity("");
      setCityCustom(false);
    }
    setPop(null);
  }

  /* ===== قوائم مفلترة ===== */
  const countryRows = useMemo(() => {
    const q = normAr(countryQ);
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => normAr(c.ar + " " + c.code).includes(q));
  }, [countryQ]);

  const cityRows = useMemo(() => {
    const arr = CITIES[countryCode] || [];
    const q = normAr(cityQ);
    const rows: { v: string; custom?: boolean }[] = [];
    if (cityCustom && city) rows.push({ v: city, custom: true });
    for (const cName of arr) {
      if (!q || normAr(cName).includes(q)) rows.push({ v: cName });
    }
    return rows;
  }, [countryCode, cityQ, cityCustom, city]);

  const paymentRows = useMemo(() => {
    const q = normAr(paymentQ);
    if (!q) return PAYMENT_METHODS.map((m) => ({ m, exact: true }));
    return PAYMENT_METHODS.filter(
      (m) => normAr(m.v + " " + m.d).includes(q)
    ).map((m) => ({ m, exact: true }));
  }, [paymentQ]);
  const paymentExactMatch = useMemo(
    () => PAYMENT_METHODS.some((m) => normAr(m.v) === normAr(paymentQ)) || !normAr(paymentQ),
    [paymentQ]
  );

  /* ===== شبكة أيام الشهر ===== */
  const dateGrid = useMemo(() => {
    const y = dateView.getFullYear();
    const m = dateView.getMonth();
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const cells: { iso: string; d: number }[] = [];
    for (let i = 0; i < first; i++) cells.push({ iso: "", d: 0 });
    for (let d = 1; d <= dim; d++) cells.push({ iso: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, d });
    while (cells.length < 42) cells.push({ iso: "", d: 0 });
    return cells;
  }, [dateView]);

  const dateLabel = useMemo(() => {
    if (!date) return { main: "اختر التاريخ", sub: "", ph: true };
    const d = new Date(date + "T00:00:00");
    if (Number.isNaN(d.getTime())) return { main: "اختر التاريخ", sub: "", ph: true };
    return {
      main: `${WEEK_AR[d.getDay()]}، ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`,
      sub: date.replace(/-/g, "/"),
      ph: false,
    };
  }, [date]);

  /* ===== الحفظ ===== */
  function payload() {
    return {
      type,
      signingMode,
      party1: party1.trim(),
      party2: party2.trim(),
      amount: amountValue,
      city: city.trim(),
      country: countryCode,
      subject: subject.trim(),
      duration: durValue,
      paymentMethod: payment.trim(),
      notes: notes.trim(),
      clauses: clauses.map((c) => c.trim()).filter(Boolean),
    };
  }

  function basicValidation(): string {
    if (!party1.trim()) return "أدخل اسم الطرف الأول أولاً.";
    if (!party2.trim()) return "أدخل اسم الطرف الثاني أولاً.";
    return "";
  }

  function gate(action: "save" | "print") {
    saveGuestDraft(payload());
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
      setOpen(false);
      resetAll();
      /* الفلو كالنسخة القديمة: بعد الحفظ تُفتح صفحة التوقيع مباشرة (بلا نزول للأسفل) */
      if (data.contract?.id) {
        window.location.assign(`/sign/${data.contract.id}`);
        return;
      }
      if (data.contract && data.shareUrl) {
        setSaved({ contract: data.contract, shareUrl: data.shareUrl });
      }
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

  /* ===== معاينة نص العقد المولّد (نفس منطق الخادم) ===== */
  const preview = useMemo(() => {
    const cleanClauses = clauses.map((c) => c.trim()).filter(Boolean);
    return buildContractContent({
      type,
      party1Name: party1.trim() || "……",
      party2Name: party2.trim() || "……",
      amount: amountValue,
      city,
      subject,
      duration: durValue,
      paymentMethod: payment,
      notes,
      clauses: cleanClauses.length ? cleanClauses : undefined,
      date: date ? new Date(date + "T00:00:00") : new Date(),
    });
  }, [type, party1, party2, amountValue, city, subject, durValue, payment, notes, clauses, date]);

  if (!open) return null;

  return (
    <>
      <div
        className="modal-overlay active"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mithaqModalTitle"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="modal mithaq-modal">
          {/* ===== الترويسة ===== */}
          <div className="modal-header">
            <div className="modal-header-content">
              <div className="label">ميثاق – MITHAQ</div>
              <h3 id="mithaqModalTitle">إنشاء عقد جديد</h3>
            </div>
            <button
              className="modal-close"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              type="button"
            >
              <i className="fas fa-xmark" />
            </button>
          </div>

          {/* ===== الجسم ===== */}
          <div className="modal-body">
            <div className="modal-steps">
              <div className="step active">١ – بيانات العقد</div>
              <div className="step">٢ – التوليد</div>
              <div className="step">٣ – التوقيع والدفع</div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {/* نوع العقد */}
              <div className="form-group">
                <label className="form-label" htmlFor="mqType">
                  <i className="fas fa-list-ul" /> نوع العقد
                </label>
                <select
                  id="mqType"
                  className="form-select"
                  required
                  value={type}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setType(nextType);
                    /* تعبئة البنود الافتراضية للنوع المختار تلقائياً —
                       فقط إذا لم يكتب المستخدم بنوداً خاصة به بعد */
                    const hasCustom = clauses.some((c) => c.trim());
                    if (!hasCustom && DEFAULT_CLAUSES[nextType]) {
                      setClauses([...DEFAULT_CLAUSES[nextType]]);
                    }
                  }}
                >
                  {Object.entries(CONTRACT_TYPES).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* نمط التوقيع */}
              <div className="form-group">
                <label className="form-label">
                  <i className="fas fa-pen-nib" /> نمط التوقيع
                </label>
                <div className="mode-select">
                  <label className="mode-option">
                    <input
                      type="radio"
                      name="signingMode"
                      value="send"
                      checked={signingMode === "send"}
                      onChange={() => setSigningMode("send")}
                    />
                    <span>
                      <b>
                        <i className="fas fa-paper-plane" /> إرسال للطرف الثاني
                      </b>
                      <small>
                        عادي — بعد توقيعك تُرسل نافذة مشاركة الرابط مع الطرف
                        الثاني ليوقع من جهازه
                      </small>
                    </span>
                  </label>
                  <label className="mode-option">
                    <input
                      type="radio"
                      name="signingMode"
                      value="quick"
                      checked={signingMode === "quick"}
                      onChange={() => setSigningMode("quick")}
                    />
                    <span>
                      <b>
                        <i className="fas fa-bolt" /> سريع — جهاز واحد
                      </b>
                      <small>
                        للمكاتب — توقيع الطرفين بالتناوب على هذا الجهاز دون
                        إرسال
                      </small>
                    </span>
                  </label>
                </div>
              </div>

              {/* الأطراف */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="mqParty1">
                    <i className="fas fa-user" /> اسم الطرف الأول
                  </label>
                  <input
                    id="mqParty1"
                    type="text"
                    className="form-input"
                    placeholder="مثال: أحمد علي السلمي"
                    required
                    maxLength={120}
                    value={party1}
                    onChange={(e) => setParty1(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="mqParty2">
                    <i className="fas fa-user-tie" /> اسم الطرف الثاني
                  </label>
                  <input
                    id="mqParty2"
                    type="text"
                    className="form-input"
                    placeholder="مثال: شركة المستقبل"
                    required
                    maxLength={120}
                    value={party2}
                    onChange={(e) => setParty2(e.target.value)}
                  />
                </div>
              </div>

              {/* المبلغ + التاريخ */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="mqAmount">
                    <i className="fas fa-coins" /> المبلغ{" "}
                    <span className="optional">(اختياري)</span>
                  </label>
                  <div className="mq-relative" data-mq-field="currency">
                    <div className="mq-split">
                      <input
                        id="mqAmount"
                        type="text"
                        className="mq-split-field"
                        inputMode="decimal"
                        dir="ltr"
                        autoComplete="off"
                        placeholder="0.00"
                        aria-label="قيمة المبلغ"
                        value={amountInput}
                        onChange={(e) => {
                          setAmountInput(cleanMoney(e.target.value));
                          setAmountCustomHint("");
                        }}
                        onKeyDown={(e) => {
                          if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
                        }}
                        onBlur={() => {
                          const n = Number(cleanMoney(amountInput));
                          if (amountInput && isFinite(n) && n > 0) {
                            setAmountInput(
                              n.toLocaleString("en-US", { maximumFractionDigits: 2 })
                            );
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="mq-split-btn"
                        aria-haspopup="listbox"
                        aria-expanded={pop === "currency"}
                        title="اختيار العملة"
                        onClick={() => togglePop("currency")}
                      >
                        <span className="mq-cur-sym">{cur.sym}</span>
                        <span className="mq-cur-code">{cur.code}</span>
                        <i className={`fas fa-chevron-down mq-caret${pop === "currency" ? " mq-rotated" : ""}`} />
                      </button>
                    </div>
                    {pop === "currency" && (
                      <div className={`mq-pop${popUp ? " mq-pop-up" : ""}`} role="listbox" aria-label="العملة">
                        <ul className="mq-list">
                          {CURRENCIES.map((c) => (
                            <li key={c.code}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={c.code === curCode}
                                className={`mq-opt${c.code === curCode ? " active" : ""}`}
                                onClick={() => {
                                  setCurCode(c.code);
                                  setPop(null);
                                }}
                              >
                                <span className="mq-opt-ico">{c.sym}</span>
                                <span className="mq-opt-txt">
                                  <b dir="ltr" style={{ textAlign: "left" }}>{c.code}</b>
                                  <span>{c.name}</span>
                                </span>
                                <i className="fas fa-check mq-opt-check" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {amountHint && <p className={`mq-hint${amountHint.bad ? " bad" : ""}`}>{amountHint.text}</p>}
                </div>

                {/* منتقي التاريخ */}
                <div className="form-group">
                  <label className="form-label">
                    <i className="fas fa-calendar-days" /> تاريخ العقد
                  </label>
                  <div className="mq-relative" data-mq-field="date">
                    <button
                      type="button"
                      className="mq-trigger"
                      aria-haspopup="dialog"
                      aria-expanded={pop === "date"}
                      onClick={() => togglePop("date")}
                    >
                      <i className="fas fa-calendar-days mq-trigger-ico" />
                      <span className="mq-trigger-col">
                        <span className={`mq-trigger-txt${dateLabel.ph ? " ph" : ""}`}>
                          {dateLabel.main}
                        </span>
                        <span className="mq-trigger-sub">{dateLabel.sub}</span>
                      </span>
                      <i className="fas fa-chevron-down mq-caret" />
                    </button>
                    {pop === "date" && (
                      <div className={`mq-pop mq-pop-date${popUp ? " mq-pop-up" : ""}`} role="dialog" aria-label="منتقي التاريخ">
                        <div className="mq-dp-nav">
                          <button type="button" className="mq-round" title="السنة السابقة" onClick={() => setDateView(new Date(dateView.getFullYear(), dateView.getMonth() - 12, 1))}>
                            <i className="fas fa-angles-right" />
                          </button>
                          <button type="button" className="mq-round" title="الشهر السابق" onClick={() => setDateView(new Date(dateView.getFullYear(), dateView.getMonth() - 1, 1))}>
                            <i className="fas fa-angle-right" />
                          </button>
                          <b className="mq-dp-caption">
                            {MONTHS_AR[dateView.getMonth()]} {dateView.getFullYear()}
                          </b>
                          <button type="button" className="mq-round" title="الشهر التالي" onClick={() => setDateView(new Date(dateView.getFullYear(), dateView.getMonth() + 1, 1))}>
                            <i className="fas fa-angle-left" />
                          </button>
                          <button type="button" className="mq-round" title="السنة التالية" onClick={() => setDateView(new Date(dateView.getFullYear(), dateView.getMonth() + 12, 1))}>
                            <i className="fas fa-angles-left" />
                          </button>
                        </div>
                        <div className="mq-dp-week">
                          {WEEK_SHORT.map((w) => (
                            <span key={w}>{w}</span>
                          ))}
                        </div>
                        <div className="mq-dp-grid">
                          {dateGrid.map((cell, i) =>
                            cell.iso ? (
                              <button
                                key={i}
                                type="button"
                                className={`mq-day${cell.iso === date ? " sel" : ""}${cell.iso === todayISO() ? " today" : ""}`}
                                onClick={() => {
                                  setDate(cell.iso);
                                  setPop(null);
                                }}
                              >
                                {cell.d}
                              </button>
                            ) : (
                              <span key={i} className="mq-day blank" />
                            )
                          )}
                        </div>
                        <div className="mq-dp-foot">
                          <button
                            type="button"
                            className="mq-mini primary"
                            onClick={() => {
                              setDate(todayISO());
                              setDateView(new Date());
                              setPop(null);
                            }}
                          >
                            <i className="fas fa-rotate-left" /> اليوم
                          </button>
                          <button
                            type="button"
                            className="mq-mini"
                            onClick={() => {
                              setDate("");
                              setPop(null);
                            }}
                          >
                            <i className="fas fa-xmark" /> مسح
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* الدولة + المدينة */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    <i className="fas fa-flag" /> الدولة{" "}
                    <span className="optional">(اختر أولاً)</span>
                  </label>
                  <div className="mq-relative" data-mq-field="country">
                    <button
                      type="button"
                      className="mq-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={pop === "country"}
                      onClick={() => togglePop("country")}
                    >
                      <span className={`mq-trigger-txt${country ? "" : " ph"}`}>
                        {country ? `${country.flag} ${country.ar}` : "اختر الدولة أولاً"}
                      </span>
                      <i className="fas fa-chevron-down mq-caret" />
                    </button>
                    {pop === "country" && (
                      <div className={`mq-pop${popUp ? " mq-pop-up" : ""}`} role="listbox" aria-label="الدول">
                        <div className="mq-search">
                          <i className="fas fa-magnifying-glass" />
                          <input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="ابحث عن دولة... (مثال: السعودية، تركيا، أمريكا)"
                            value={countryQ}
                            onChange={(e) => setCountryQ(e.target.value)}
                            autoFocus
                          />
                        </div>
                        {countryRows.length ? (
                          <ul className="mq-list">
                            {countryRows.map((c) => (
                              <li key={c.code}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={c.code === countryCode}
                                  className={`mq-opt${c.code === countryCode ? " active" : ""}`}
                                  onClick={() => commitCountry(c.code)}
                                >
                                  <span className="mq-opt-ico">{c.flag}</span>
                                  <span className="mq-opt-txt">
                                    <b>{c.ar}</b>
                                    <span>{(CITIES[c.code] || []).length} مدينة</span>
                                  </span>
                                  <i className="fas fa-check mq-opt-check" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mq-empty">لا توجد دول مطابقة</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <i className="fas fa-map-pin" /> المدينة{" "}
                    <span className="optional">(اختياري)</span>
                  </label>
                  <div className="mq-relative" data-mq-field="city">
                    <div className="mq-field-row">
                      <button
                        type="button"
                        className="mq-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={pop === "city"}
                        onClick={() => {
                          /* إن لم تُختر دولة بعد: افتح قائمة الدول (توجيه لطيف) */
                          if (!countryCode) {
                            togglePop("country");
                            return;
                          }
                          togglePop("city");
                        }}
                      >
                        <i className="fas fa-building mq-trigger-ico" />
                        <span className={`mq-trigger-txt${city ? "" : " ph"}`}>
                          {city || (countryCode ? "اختر المدينة من القائمة" : "اختر الدولة أولاً")}
                        </span>
                        <i className="fas fa-chevron-down mq-caret" />
                      </button>
                      {city && (
                        <button
                          type="button"
                          className="mq-icon-btn"
                          title="مسح المدينة"
                          aria-label="مسح المدينة"
                          onClick={() => {
                            setCity("");
                            setCityCustom(false);
                          }}
                        >
                          <i className="fas fa-xmark" />
                        </button>
                      )}
                    </div>
                    {pop === "city" && countryCode && (
                      <div className={`mq-pop${popUp ? " mq-pop-up" : ""}`} role="listbox" aria-label="المدن العربية">
                        <div className="mq-search">
                          <i className="fas fa-magnifying-glass" />
                          <input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="ابحث عن مدينة... (مثال: دمشق، الرياض، دبي)"
                            value={cityQ}
                            onChange={(e) => setCityQ(e.target.value)}
                            autoFocus
                          />
                        </div>
                        {cityRows.length ? (
                          <ul className="mq-list">
                            {cityRows.map((o) => (
                              <li key={o.v}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={city === o.v}
                                  className={`mq-opt${city === o.v ? " active" : ""}`}
                                  onClick={() => {
                                    setCity(o.v);
                                    setCityCustom(!!o.custom);
                                    setPop(null);
                                  }}
                                >
                                  <span className="mq-opt-ico">
                                    <i className={`fas ${o.custom ? "fa-file-pen" : "fa-building"}`} />
                                  </span>
                                  <span className="mq-opt-txt">
                                    <b>{o.v}</b>
                                    <span>{o.custom ? "قيمة محفوظة سابقاً" : country?.ar || ""}</span>
                                  </span>
                                  <i className="fas fa-check mq-opt-check" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mq-empty">لا توجد مدن مطابقة — امسح البحث أو جرّب اسماً آخر</div>
                        )}
                      </div>
                    )}
                    {pop === "city" && !countryCode && (
                      <div className="mq-pop">
                        <div className="mq-empty">اختر الدولة أولاً من القائمة أعلاه</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* المدة + طريقة السداد */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="mqDuration">
                    <i className="fas fa-stopwatch" /> مدة العقد{" "}
                    <span className="optional">(اختياري)</span>
                  </label>
                  <div className="mq-relative" data-mq-field="duration">
                    <div className="mq-split">
                      <input
                        id="mqDuration"
                        type="text"
                        className="mq-split-field"
                        inputMode="numeric"
                        dir="ltr"
                        autoComplete="off"
                        maxLength={4}
                        placeholder="6"
                        aria-label="مدة العقد"
                        value={durInput}
                        onChange={(e) => {
                          const s = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                          setDurInput(s);
                          setDurCustomHint("");
                        }}
                        onKeyDown={(e) => {
                          if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
                        }}
                      />
                      <button
                        type="button"
                        className="mq-split-btn"
                        aria-haspopup="listbox"
                        aria-expanded={pop === "duration"}
                        title="وحدة المدة"
                        onClick={() => togglePop("duration")}
                      >
                        <span>{durUnitLabel(durUnit)}</span>
                        <i className={`fas fa-chevron-down mq-caret${pop === "duration" ? " mq-rotated" : ""}`} />
                      </button>
                    </div>
                    {pop === "duration" && (
                      <div className={`mq-pop mq-unit-pop${popUp ? " mq-pop-up" : ""}`} role="listbox" aria-label="وحدة المدة">
                        <div className="mq-unit-list">
                          {(["day", "month", "year"] as DurUnit[]).map((u) => (
                            <button
                              key={u}
                              type="button"
                              className={`mq-opt${durUnit === u ? " active" : ""}`}
                              onClick={() => {
                                setDurUnit(u);
                                setPop(null);
                              }}
                            >
                              <span>{durUnitLabel(u)}</span>
                              <i className="fas fa-check mq-opt-check" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {durHint && <p className={`mq-hint${durHint.bad ? " bad" : ""}`}>{durHint.text}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <i className="fas fa-credit-card" /> طريقة السداد{" "}
                    <span className="optional">(اختياري)</span>
                  </label>
                  <div className="mq-relative" data-mq-field="payment">
                    <button
                      type="button"
                      className="mq-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={pop === "payment"}
                      onClick={() => togglePop("payment")}
                    >
                      <span className="mq-trigger-ico">
                        <i
                          className={
                            paymentCustom && payment
                              ? "fas fa-file-pen"
                              : payment
                                ? paymentFind(payment)?.icon || "fas fa-money-bill-wave"
                                : "fas fa-money-bill-wave"
                          }
                        />
                      </span>
                      <span className={`mq-trigger-txt${payment ? "" : " ph"}`}>
                        {payment || "اختر طريقة الدفع من القائمة"}
                      </span>
                      <i className="fas fa-chevron-down mq-caret" />
                    </button>
                    {pop === "payment" && (
                      <div className={`mq-pop${popUp ? " mq-pop-up" : ""}`} role="listbox" aria-label="طرق الدفع">
                        <div className="mq-search">
                          <i className="fas fa-magnifying-glass" />
                          <input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="ابحث عن طريقة الدفع…"
                            value={paymentQ}
                            onChange={(e) => setPaymentQ(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <ul className="mq-list">
                          {paymentRows.map(({ m }) => (
                            <li key={m.v}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={payment === m.v && !paymentCustom}
                                className={`mq-opt${payment === m.v && !paymentCustom ? " active" : ""}`}
                                onClick={() => {
                                  setPayment(m.v);
                                  setPaymentCustom(false);
                                  setPop(null);
                                }}
                              >
                                <span className="mq-opt-ico">
                                  <i className={m.icon} />
                                </span>
                                <span className="mq-opt-txt">
                                  <b>{m.v}</b>
                                  <span>{m.d}</span>
                                </span>
                                <i className="fas fa-check mq-opt-check" />
                              </button>
                            </li>
                          ))}
                          {/* قيمة مخصصة عند عدم التطابق */}
                          {!paymentExactMatch && (
                            <li>
                              <button
                                type="button"
                                role="option"
                                aria-selected={paymentCustom}
                                className={`mq-opt${paymentCustom ? " active" : ""}`}
                                onClick={() => {
                                  setPayment(paymentQ.trim());
                                  setPaymentCustom(true);
                                  setPop(null);
                                }}
                              >
                                <span className="mq-opt-ico">
                                  <i className="fas fa-file-pen" />
                                </span>
                                <span className="mq-opt-txt">
                                  <b>استخدام: {paymentQ.trim()}</b>
                                  <span>قيمة مخصصة خارج القائمة</span>
                                </span>
                                <i className="fas fa-check mq-opt-check" />
                              </button>
                            </li>
                          )}
                          {!paymentRows.length && paymentExactMatch && (
                            <li className="mq-empty">لا توجد طرق مطابقة</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* موضوع العقد */}
              <div className="form-group">
                <label className="form-label" htmlFor="mqSubject">
                  <i className="fas fa-file-lines" /> موضوع العقد{" "}
                  <span className="optional">(اختياري)</span>
                </label>
                <input
                  id="mqSubject"
                  type="text"
                  className="form-input"
                  placeholder="وصف مختصر لموضوع العقد"
                  maxLength={200}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              {/* البنود */}
              <div className="form-group">
                <label className="form-label">
                  <i className="fas fa-list-check" /> البنود — كل بند في سطر مستقل
                </label>
                <textarea
                  className="form-input"
                  rows={5}
                  style={{ resize: "vertical", lineHeight: 1.9 }}
                  value={clauses.join("\n")}
                  onChange={(e) =>
                    setClauses(e.target.value.split("\n"))
                  }
                  placeholder="اتركه فارغاً لاستخدام البنود الافتراضية لنوع العقد — أو الصق بنودك هنا"
                />
                <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                  <button
                    className="btn-modal-secondary"
                    type="button"
                    style={{ padding: "9px 16px", fontSize: 12.5 }}
                    onClick={() => setPickerOpen(true)}
                  >
                    ＋ بنود جاهزة (محررة قانونياً)
                  </button>
                  <button
                    className="btn-modal-secondary"
                    type="button"
                    style={{ padding: "9px 16px", fontSize: 12.5 }}
                    onClick={() => {
                      /* إضافة سطر فارغ جديد لبند يدوي + توجيه المؤشر إليه */
                      setClauses((cs) => {
                        const arr = cs.filter((c, i) => c.trim() || i < cs.length - 1);
                        return [...arr, ""];
                      });
                      setTimeout(() => {
                        const ta = document.querySelector<HTMLTextAreaElement>(
                          ".mithaq-modal textarea.form-input"
                        );
                        if (ta) {
                          ta.focus();
                          ta.selectionStart = ta.selectionEnd = ta.value.length;
                        }
                      }, 0);
                    }}
                  >
                    ＋ إضافة بند
                  </button>
                  {clauses.length > 0 && (
                    <button
                      className="btn-modal-secondary"
                      type="button"
                      style={{ padding: "9px 16px", fontSize: 12.5 }}
                      onClick={() => setClauses([])}
                    >
                      مسح البنود
                    </button>
                  )}
                </div>
              </div>

              {/* ملاحظات */}
              <div className="form-group">
                <label className="form-label" htmlFor="mqNotes">
                  <i className="fas fa-note-sticky" /> ملاحظات إضافية{" "}
                  <span className="optional">(اختياري)</span>
                </label>
                <textarea
                  id="mqNotes"
                  className="form-input"
                  rows={3}
                  style={{ resize: "vertical", lineHeight: 1.9 }}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* معاينة العقد المولّد */}
              <details className="form-group">
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 13.5,
                    color: "var(--green)",
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <i className="fas fa-eye" style={{ color: "var(--gold-dark)" }} />
                  معاينة العقد — تتحدث فورياً أثناء الكتابة
                </summary>
                <div
                  style={{
                    marginTop: 10,
                    maxHeight: 320,
                    overflowY: "auto",
                    borderRadius: 16,
                    border: "1px solid rgba(212,168,67,0.35)",
                    background: "linear-gradient(180deg, #fffdf6, #fcfaf2)",
                    padding: 16,
                  }}
                >
                  <b style={{ color: "var(--green)" }}>{contractTypeName(type)}</b>
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
                    color: "var(--text-2)",
                    fontSize: 10.5,
                    display: "block",
                    marginTop: 6,
                  }}
                >
                  النص النهائي يُبنى ويُختم بالبصمة في الخادم بنفس المنطق تماماً
                </small>
              </details>

              {notice && (
                <p style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 800, margin: "0 0 12px" }}>
                  {notice}
                </p>
              )}
              {error && (
                <p style={{ color: "#c93c3c", fontSize: 12.5, fontWeight: 800, margin: "0 0 12px" }}>
                  {error}
                </p>
              )}
              {error && error.indexOf("حد الباقة المجانية") !== -1 && (
                <a
                  className="btn btn-primary"
                  href="/pricing"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14, textDecoration: "none" }}
                >
                  <i className="fas fa-crown" />
                  ترقية الباقة
                </a>
              )}

              {/* الفوتر */}
              <div className="modal-footer" style={{ padding: 0 }}>
                <button
                  className="btn-modal-secondary"
                  type="button"
                  onClick={() => {
                    const draft = loadGuestDraft();
                    if (draft) {
                      fillFromDraft(draft);
                      setNotice("تم استرجاع المسودة المحفوظة ✅");
                    } else {
                      setNotice("لا توجد مسودة محفوظة على هذا الجهاز.");
                    }
                  }}
                >
                  استرجاع المسودة
                </button>
                <button
                  className="btn-modal-secondary"
                  type="button"
                  onClick={() => {
                    clearGuestDraft();
                    resetAll();
                    setDate(todayISO());
                    setNotice("تم مسح المسودة.");
                  }}
                >
                  مسح المسودة
                </button>
                <button
                  className="btn-modal-secondary"
                  type="button"
                  disabled={busy}
                  onClick={printContract}
                  title="حفظ ثم فتح صفحة الطباعة / PDF"
                >
                  🖨️ طباعة / PDF
                </button>
                <button className="btn-modal-primary" type="submit" disabled={busy}>
                  <i className="fas fa-wand-magic-sparkles" />
                  {busy ? "جاري…" : "توليد العقد"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ClausePickerModal
        open={pickerOpen}
        contractType={type}
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
    </>
  );
}
