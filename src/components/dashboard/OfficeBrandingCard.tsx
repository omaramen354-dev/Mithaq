"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ============================================================
   OfficeBrandingCard — هوية وشعار المكتب المخصّص على الـ PDF
   - مفتوحة حصراً لأصحاب باقة المكاتب والشركات ($49/شهر) النشطة
   - لأي باقة أدنى: بطاقة مقفلة توضّح الميزة مع زر الترقية لباقة $49
   - الخادم يتحقق أيضاً في PATCH /api/me ويرفض أي محاولة غير مصرح بها (403)
   ============================================================ */

type Props = {
  canCustomize: boolean;
  initialOfficeName: string;
  initialOfficeLogo: string;
};

export default function OfficeBrandingCard({
  canCustomize,
  initialOfficeName,
  initialOfficeLogo,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [officeName, setOfficeName] = useState(initialOfficeName);
  const [officeLogo, setOfficeLogo] = useState(initialOfficeLogo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  if (!canCustomize) {
    return (
      <section className="office-brand-card office-brand-locked reveal" aria-label="شعار المكتب المخصّص">
        <div className="office-brand-lock-icon">
          <i className="fas fa-crown" />
        </div>
        <div className="office-brand-lock-body">
          <div className="office-brand-pill">
            <i className="fas fa-lock" /> ميزة حصرية لباقة المكاتب والشركات ($49/شهر)
          </div>
          <h3>اطبع عقودك باسم وشعار مكتبك المخصّص</h3>
          <p>
            عند الترقية لباقة المكاتب والشركات يمكنك رفع شعار شركتك أو مكتبك الهندسي/العقاري/القانوني
            ليظهر في ترويسة كل عقد PDF رسمي تصدره عبر ميثاق.
          </p>
        </div>
        <div className="office-brand-lock-cta">
          <Link className="btn btn-primary" href="/pricing">
            <i className="fas fa-arrow-up-right-dots" /> ترقية لباقة المكاتب ($49)
          </Link>
        </div>
      </section>
    );
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setMsg({ text: "يُسمح فقط بصور PNG أو JPG.", ok: false });
      return;
    }
    if (file.size > 150_000) {
      setMsg({
        text: "حجم الصورة أكبر من 150 كيلوبايت — صغّر الشعار قليلاً ثم أعد الرفع.",
        ok: false,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setOfficeLogo(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function save(nextName = officeName, nextLogo = officeLogo) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            officeName: nextName.trim(),
            officeLogo: nextLogo,
          },
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setMsg({ text: data.message || "تعذر حفظ هوية المكتب.", ok: false });
      } else {
        setMsg({
          text: "تم حفظ هوية مكتبك بنجاح — سيظهر شعارك في ترويسة كل عقود PDF الجديدة والسابقة.",
          ok: true,
        });
        router.refresh();
      }
    } catch {
      setMsg({ text: "تعذر الاتصال بالخادم — حاول مجدداً.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function removeBranding() {
    setOfficeName("");
    setOfficeLogo("");
    if (fileRef.current) fileRef.current.value = "";
    await save("", "");
  }

  return (
    <section className="office-brand-card reveal" aria-label="هوية وشعار المكتب المخصّص">
      <div className="office-brand-head">
        <div>
          <span className="office-brand-pill active">
            <i className="fas fa-crown" /> ميزة باقة المكاتب المفعّلة ($49)
          </span>
          <h3>هوية وشعار مكتبك على عقود الـ PDF</h3>
          <p>ارفع شعار مكتبك (PNG/JPG بحد 150 كيلوبايت) ليظهر في أعلى جميع عقودك المطبوعة.</p>
        </div>
        {officeLogo && (
          <div className="office-brand-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={officeLogo} alt="معاينة شعار المكتب" />
          </div>
        )}
      </div>

      <div className="office-brand-form">
        <div className="office-brand-field">
          <label htmlFor="office-name-input">اسم المكتب أو الشركة (اختياري)</label>
          <input
            id="office-name-input"
            type="text"
            maxLength={80}
            value={officeName}
            onChange={(e) => setOfficeName(e.target.value)}
            placeholder="مثال: مكتب النور للاستشارات القانونية والعقارية"
          />
        </div>
        <div className="office-brand-field">
          <label htmlFor="office-logo-input">ملف الشعار (PNG أو JPG — حتى 150 KB)</label>
          <input
            ref={fileRef}
            id="office-logo-input"
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFile}
          />
        </div>
      </div>

      {msg && (
        <div className={`office-brand-msg ${msg.ok ? "ok" : "err"}`}>
          <i className={`fas ${msg.ok ? "fa-circle-check" : "fa-circle-exclamation"}`} />
          <span>{msg.text}</span>
        </div>
      )}

      <div className="office-brand-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => save()}
        >
          <i className="fas fa-floppy-disk" /> {busy ? "جارٍ الحفظ..." : "حفظ شعار المكتب"}
        </button>
        {(officeName || officeLogo) && (
          <button
            type="button"
            className="btn btn-soft btn-sm"
            disabled={busy}
            onClick={removeBranding}
          >
            <i className="fas fa-rotate-left" /> استعادة شعار ميثاق الافتراضي
          </button>
        )}
      </div>
    </section>
  );
}
