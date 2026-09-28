"use client";

/* ============================================================
   PricingClient — شبكة الباقات + نافذة إثبات الدفع (مكوّن عميل)
   الدفع يدوي آمن: USDT TRC20 أو شام كاش ← المستخدم يرسل الإثبات
   (TXID أو رقم الإيصال) ← المشرف يؤكد من /admin ← تفعيل الباقة.
   ⚠️ عدّل بيانات المحفظة/شام كاش/واتساب في الثوابت أدناه قبل النشر.
   ============================================================ */

import { useMemo, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { PAID_PLANS, priceLabel, priceLabelSyp, type Plan } from "@/lib/plans";
import { whatsappLink } from "@/lib/whatsapp";

/* ===== بيانات الدفع — عدّلها قبل النشر ===== */
const WALLET = "TXYZ...REPLACE_WITH_YOUR_TRC20_WALLET";
const SHAM_NAME = "<اسمك الكامل>";
const SHAM_NUMBER = "09xxxxxxxx";
const WHATSAPP = "9639XXXXXXXX";

type MyReq = { id: string; plan: string; status: string; createdAt: string };
type Pop = { plan: Plan } | null;

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  manual_review: "قيد المراجعة",
  paid: "مؤكد ✓",
  rejected: "مرفوض",
};

export default function PricingClient({
  isLoggedIn,
  userName,
  myRequests,
}: {
  isLoggedIn: boolean;
  userName: string | null;
  myRequests: MyReq[];
}) {
  const [pop, setPop] = useState<Pop>(null);
  const [method, setMethod] = useState<"usdt" | "shamcash">("usdt");
  const [txRef, setTxRef] = useState("");
  const [senderName, setSenderName] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const pendingPlans = useMemo(
    () =>
      new Set(
        myRequests
          .filter((r) => r.status === "pending" || r.status === "manual_review")
          .map((r) => r.plan)
      ),
    [myRequests]
  );
  const paidPlans = useMemo(
    () => new Set(myRequests.filter((r) => r.status === "paid").map((r) => r.plan)),
    [myRequests]
  );

  function openPop(p: Plan) {
    setPop({ plan: p });
    setMethod("usdt");
    setTxRef("");
    setSenderName("");
    setMsg(null);
    setCopied(false);
    document.body.style.overflow = "hidden";
  }
  function closePop() {
    setPop(null);
    document.body.style.overflow = "";
  }

  async function copyWallet() {
    try {
      await navigator.clipboard.writeText(WALLET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* المتصفح منع النسخ — المستخدم ينسخ يدوياً */
    }
  }

  async function submit() {
    if (!pop || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: pop.plan.id, method, txRef, senderName }),
      });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (res.ok && j.ok) {
        setMsg({ t: j.message || "تم إرسال طلبك بنجاح.", ok: true });
        setTimeout(() => window.location.reload(), 1600);
      } else {
        setMsg({ t: j.message || "تعذر إرسال الطلب — حاول مجدداً.", ok: false });
      }
    } catch {
      setMsg({ t: "تعذر الاتصال بالخدمة — تحقق من الإنترنت.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const waText =
    pop &&
    [
      "مرحباً فريق ميثاق 👋",
      "أرغب بالاشتراك في باقة: " + pop.plan.title,
      "طريقة الدفع: " + (method === "usdt" ? "USDT (TRC20)" : "شام كاش"),
      txRef ? "مرجع العملية: " + txRef : "",
      senderName ? "اسم المُرسل: " + senderName : "",
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <main className="pricing-page">
      {/* الترويسة */}
      <header className="pricing-hero">
        <Link className="pricing-back" href="/">
          <i className="fas fa-arrow-right" />
          العودة إلى المنصة
        </Link>
        <div className="pricing-logo">
          <Logo height={44} />
          <span className="pricing-brand">مِــيــثَــاق</span>
        </div>
      </header>

      <section className="pricing-intro">
        <div className="section-label">الأسعار والباقات</div>
        <h1 className="pricing-title">
          اختر باقتك، ووثّق عقودك <span className="gold">بثقة</span>
        </h1>
        <p className="pricing-sub">
          ادفع بـ USDT (TRC20) أو شام كاش — أرسل إثبات الدفع ويُفعّل فريقنا باقتك
          على حسابك بعد المراجعة (عادة خلال ساعات قليلة).
        </p>
        {!isLoggedIn && (
          <div className="pricing-guest-note">
            <i className="fas fa-circle-info" />
            أنت تصفح كزائر —{" "}
            <Link href="/login">
              سجّل الدخول بجوجل
            </Link>{" "}
            أولاً حتى يُربط الطلب بحسابك.
          </div>
        )}
        {isLoggedIn && userName && (
          <div className="pricing-hello">
            <i className="fas fa-user-check" />
            مرحباً {userName} — الطلبات تُربط بحسابك تلقائياً
          </div>
        )}
      </section>

      {/* شبكة الباقات */}
      <section className="pricing-grid">
        {PAID_PLANS.map((p) => {
          const pending = pendingPlans.has(p.id);
          const paid = paidPlans.has(p.id);
          return (
            <article
              key={p.id}
              className={`plan-card${p.popular ? " popular" : ""}${p.service ? " service" : ""}`}
            >
              {p.popular && <div className="plan-ribbon">الأكثر اختياراً</div>}
              <div className="plan-head">
                <span className="plan-icon">
                  <i className={`fas ${p.icon}`} />
                </span>
                <h2 className="plan-title">{p.title}</h2>
                <div className="plan-price">
                  <b>{priceLabel(p)}</b>
                  <span>{priceLabelSyp(p)}</span>
                </div>
                <p className="plan-tagline">{p.tagline}</p>
              </div>
              <ul className="plan-features">
                {p.features.map((f) => (
                  <li key={f}>
                    <i className="fas fa-check" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="plan-cta">
                {paid ? (
                  <span className="plan-state ok">
                    <i className="fas fa-circle-check" /> مفعّلة في حسابك
                  </span>
                ) : pending ? (
                  <span className="plan-state wait">
                    <i className="fas fa-hourglass-half" /> طلبك قيد المراجعة
                  </span>
                ) : isLoggedIn ? (
                  <button
                    type="button"
                    className="btn btn-primary plan-btn"
                    onClick={() => openPop(p)}
                  >
                    <i className="fas fa-bolt" />
                    اشترك الآن
                  </button>
                ) : (
                  <Link href="/login" className="btn btn-outline plan-btn">
                    <i className="fas fa-right-to-bracket" />
                    سجّل الدخول للاشتراك
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* حالة طلباتي */}
      {isLoggedIn && myRequests.length > 0 && (
        <section className="pricing-myreqs">
          <h2>
            <i className="fas fa-receipt" />
            طلباتي الأخيرة
          </h2>
          <ul>
            {myRequests.map((r) => (
              <li key={r.id}>
                <span className="myreq-plan">{r.plan}</span>
                <span className={`myreq-state s-${r.status}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
                <span className="myreq-date">
                  {new Date(r.createdAt).toLocaleDateString("ar")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* سؤال شائع */}
      <section className="pricing-faq">
        <h2>
          <i className="fas fa-circle-question" />
          كيف تتم عملية الدفع؟
        </h2>
        <ol className="pricing-steps">
          <li>اختر باقتك واضغط «اشترك الآن».</li>
          <li>حوّل المبلغ إلى محفظة USDT (شبكة TRC20 فقط) أو عبر شام كاش.</li>
          <li>أرسل رقم العملية (TXID) أو رقم إيصال شام كاش في النافذة.</li>
          <li>يراجع فريق ميثاق الطلب ويُفعّل باقتك في حسابك — عادة خلال ساعات.</li>
        </ol>
        <p className="pricing-note">
          <i className="fas fa-shield-halved" />
          لا نطلب أبداً كلمة مرور محفظتك أو رمز التحقق — التحويل يتم من محفظتك
          مباشرة إلى محفظتنا المعروضة في النافذة.
        </p>
      </section>

      {/* ===== نافذة إثبات الدفع ===== */}
      {pop && (
        <div className="paypop-overlay" onClick={closePop}>
          <div
            className="paypop"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`الدفع لباقة ${pop.plan.title}`}
          >
            <header className="paypop-head">
              <h3>
                باقة: {pop.plan.title} —{" "}
                <span className="gold">{priceLabel(pop.plan)}</span>
              </h3>
              <button
                type="button"
                className="paypop-close"
                onClick={closePop}
                aria-label="إغلاق"
              >
                <i className="fas fa-xmark" />
              </button>
            </header>

            <div className="paypop-body">
              {/* اختيار طريقة الدفع */}
              <div className="paypop-methods">
                <button
                  type="button"
                  className={`paypop-method${method === "usdt" ? " active" : ""}`}
                  onClick={() => setMethod("usdt")}
                >
                  <i className="fab fa-bitcoin" />
                  USDT — TRC20
                </button>
                <button
                  type="button"
                  className={`paypop-method${method === "shamcash" ? " active" : ""}`}
                  onClick={() => setMethod("shamcash")}
                >
                  <i className="fas fa-mobile-screen" />
                  شام كاش
                </button>
              </div>

              {method === "usdt" ? (
                <div className="paypop-box">
                  <div className="paypop-box-title">
                    <i className="fas fa-wallet" />
                    أرسل {pop.plan.priceUsd} USDT على شبكة TRC20 فقط إلى:
                  </div>
                  <div className="paypop-wallet">
                    <code dir="ltr">{WALLET}</code>
                    <button type="button" onClick={copyWallet}>
                      <i className={`fas ${copied ? "fa-check" : "fa-copy"}`} />
                      {copied ? "تم النسخ" : "نسخ"}
                    </button>
                  </div>
                  <div className="paypop-warn">
                    <i className="fas fa-triangle-exclamation" />
                    تأكد أن الشبكة TRC20 — أي شبكة أخرى يعني فقدان المبلغ.
                  </div>
                </div>
              ) : (
                <div className="paypop-box">
                  <div className="paypop-box-title">
                    <i className="fas fa-mobile-screen" />
                    حوّل {priceLabelSyp(pop.plan)} عبر شام كاش إلى:
                  </div>
                  <div className="paypop-sham">
                    <div>
                      <span>الاسم:</span> <b>{SHAM_NAME}</b>
                    </div>
                    <div>
                      <span>الرقم:</span> <b dir="ltr">{SHAM_NUMBER}</b>
                    </div>
                  </div>
                </div>
              )}

              {/* الإثبات */}
              <label className="paypop-label">
                {method === "usdt" ? "رقم عملية التحويل (TXID) *" : "رقم الإيصال *"}
              </label>
              <input
                className="paypop-input"
                dir={method === "usdt" ? "ltr" : "rtl"}
                value={txRef}
                onChange={(e) => setTxRef(e.target.value)}
                placeholder={
                  method === "usdt"
                    ? "مثال: 9f3c… من محفظتك بعد التحويل"
                    : "رقم العملية من تطبيق شام كاش"
                }
              />
              {method === "shamcash" && (
                <>
                  <label className="paypop-label">اسم المُرسل على شام كاش *</label>
                  <input
                    className="paypop-input"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="الاسم كما ظهر في التحويل"
                  />
                </>
              )}

              {msg && (
                <div className={`paypop-msg${msg.ok ? " ok" : " bad"}`}>{msg.t}</div>
              )}

              <div className="paypop-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={submit}
                >
                  <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />
                  {busy ? "جارٍ الإرسال…" : "أرسل الطلب"}
                </button>
                <a
                  className="btn btn-outline"
                  href={whatsappLink(waText || "مرحباً، أريد الاشتراك في ميثاق")}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="fab fa-whatsapp" />
                  إرسال عبر واتساب
                </a>
              </div>
              <p className="paypop-foot">
                بعد إرسال الطلب يراجعه فريق ميثاق ويُفعّل باقتك على حسابك — يمكنك
                متابعة حالة الطلب من هذه الصفحة.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
