"use client";

/* ============================================================
   CheckoutClient — نموذج إتمام الدفع عبر شام كاش (مكون عميل)
   - يعرض الباقة المختارة وتعليمات التحويل (الرقم الثابت للدفع).
   - حقول: رقم عملية شام كاش + رقم الهاتف (اتصال/واتساب).
   - عند الإرسال: POST /api/checkout ← حفظ المعاملة + تفعيل
     المزايا فوراً وتلقائياً ← إعادة التوجيه إلى لوحة التحكم.
   ⚠️ عدّل رقم حساب شام كاش في الثوابت أدناه قبل النشر.
   ============================================================ */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { findPlan, priceLabel, priceLabelSyp } from "@/lib/plans";

/* ===== بيانات شام كاش — عدّلها قبل النشر ===== */
const SHAM_ACCOUNT = "0123456789"; // رقم حساب شام كاش المراد التحويل إليه
const SHAM_NAME = "اسم المستفيد الكامل";
const SUPPORT_WA = "9639XXXXXXXX";

export default function CheckoutClient({
  planParam,
  isLoggedIn,
  userName,
}: {
  planParam: string;
  isLoggedIn: boolean;
  userName: string | null;
}) {
  const router = useRouter();
  const plan = useMemo(() => findPlan(planParam) || findPlan("verified")!, [planParam]);

  const [txNumber, setTxNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, transactionNumber: txNumber, contactPhone: phone }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setErr(data.message || "تعذر إتمام الطلب — حاول مجدداً.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/"), 1800);
    } catch {
      setErr("تعذر الاتصال بالخدمة — تحقق من إنترنتك وحاول مجدداً.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div className="checkout-card card" style={{ maxWidth: 640 }}>
        {/* الترويسة */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 22px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              padding: "5px 8px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #071f1a, #1d4a3e)",
            }}
          >
            <Logo height={20} />
          </span>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            إنهاء الدفع عبر شام كاش
          </small>
        </div>

        <div style={{ padding: 24 }}>
          {/* الباقة المختارة */}
          <div
            className="box"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 14,
              marginBottom: 18,
            }}
          >
            <i className={`fas ${plan.icon}`} style={{ color: "var(--gold)", fontSize: 22 }} />
            <div style={{ flex: 1 }}>
              <b style={{ color: "var(--green)", fontSize: 15 }}>باقة {plan.title}</b>
              <div style={{ color: "var(--muted)", fontSize: 11 }}>{plan.tagline}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <b style={{ color: "var(--green)", fontSize: 14, display: "block" }}>
                {priceLabel(plan)}
              </b>
              <small style={{ color: "var(--muted)", fontSize: 10 }}>
                {priceLabelSyp(plan)}
              </small>
            </div>
          </div>

          {/* تعليمات الدفع */}
          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>
            <i className="fas fa-building-columns" style={{ color: "var(--gold)" }} />
            تعليمات التحويل
          </h2>
          <ol style={{ paddingLeft: 20, margin: "0 0 14px", fontSize: 12.5, color: "var(--muted)" }}>
            <li>
              حوّل مبلغ <b>{priceLabelSyp(plan)}</b> إلى حساب شام كاش التالي:
              <div
                dir="ltr"
                style={{
                  direction: "ltr",
                  background: "rgba(212,168,67,0.08)",
                  border: "1px dashed var(--gold)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  marginTop: 6,
                  textAlign: "center",
                  fontWeight: 800,
                  letterSpacing: 1,
                }}
              >
                {SHAM_ACCOUNT} — {SHAM_NAME}
              </div>
            </li>
            <li>بعد نجاح التحويل، أرسل طلبك بالحقول أدناه فقط — بدون أي رسالة واتساب إضافية.</li>
            <li>
              سيؤكد الأدمن الحوالة خلال 24 ساعة — و<b>مزاياك تُفعَّل فوراً تلقائياً</b> بعد إتمام
              الطلب.
            </li>
          </ol>

          {/* الجائزة: المزايا تفعّل فوراً — رسالة تأكيد */}
          {done && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#e9f6ee",
                border: "1.5px solid #bfe3cd",
                color: "#157347",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <i className="fas fa-circle-check" /> تم تفعيل باقتك فوراً — يتم
              تلقائياً بعد نقلك ثوانٍ إلى لوحة التحكم...
            </div>
          )}

          {!isLoggedIn ? (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1.5px solid #f5c2c2",
                background: "#fdecec",
                color: "#b91c1c",
                fontWeight: 700,
                fontSize: 12.5,
              }}
            >
              <i className="fas fa-lock" />
              تحتاج إلى تسجيل الدخول عبر Google أولاً حتى تتمكن من حفظ العملية
              وتفعيل المزايا فوراً.
              <div style={{ marginTop: 8 }}>
                <a className="btn" href="/login">
                  تسجيل الدخول
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
                رقم عملية شام كاش
              </label>
              <input
                dir="ltr"
                type="text"
                inputMode="numeric"
                pattern="\d{6,20}"
                placeholder="مثال: 1234567890"
                value={txNumber}
                onChange={(e) => setTxNumber(e.target.value.replace(/\D/g, ""))}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              />

              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
                رقم الهاتف (اتصال / واتساب)
              </label>
              <input
                dir="ltr"
                type="tel"
                inputMode="numeric"
                pattern="\d{7,15}"
                placeholder="مثال: 0933XXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  fontSize: 13,
                  marginBottom: 14,
                }}
              />

              {err && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#fdecec",
                    border: "1.5px solid #f5c2c2",
                    color: "#b91c1c",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <i className="fas fa-triangle-exclamation" /> {err}
                </div>
              )}

              <button type="submit" className="btn" disabled={busy} style={{ width: "100%" }}>
                {busy ? (
                  <>
                    <i className="fas fa-spinner fa-spin" />
                    جارٍ الإرسال...
                  </>
                ) : (
                  <>
                    <i className="fas fa-bolt" />
                    إرسال الطلب وتفعيل المزايا فوراً
                  </>
                )}
              </button>
            </form>
          )}

          <p
            className="checkout-note"
            style={{ fontSize: 11, color: "var(--muted)", marginTop: 14, textAlign: "center" }}
          >
            عند وجود استفسار:{" "}
            <a
              className="btn-soft btn"
              style={{ padding: "6px 12px", fontSize: 11 }}
              href={`https://wa.me/${SUPPORT_WA}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fab fa-whatsapp" /> تواصل عبر الواتساب
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
