"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildOfficialShareMessage, whatsappLink } from "@/lib/whatsapp";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";
import { encodeShareToken } from "@/lib/share-token";

/* ============================================================
   OwnerSignFlow — فلو توقيع صاحب العقد داخل /sign/[id]
   ١) توقيع الطرف الأول (رسم/رفع/تصوير)
   ٢) مشاركة رابط مشفّر في سطر واحد مع نسخ فوري
   ٣) العقد النهائي الموقّع من الطرفين
   ============================================================ */

type ContractLite = {
  id: string;
  type: string;
  party1Name: string;
  party2Name: string;
  status: string;
  updatedAt?: string | Date | null;
};

type Props = {
  contract: ContractLite;
  shareToken: string;
  shareUrl: string;
  party1Name: string;
  party2Name: string;
  sig1: boolean;
  sig2: boolean;
};

export default function OwnerSignFlow({
  contract,
  shareToken,
  shareUrl,
  party1Name,
  party2Name,
  sig1,
  sig2,
}: Props) {
  const router = useRouter();
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(party1Name || "");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const stage = sig2 ? 3 : sig1 ? 2 : 1;
  const verifyHref = `/verify/${encodeURIComponent(encodeShareToken(shareToken))}`;
  const waHref = whatsappLink(buildOfficialShareMessage(contract, shareUrl));

  async function submit() {
    if (!hasInk || !name.trim() || !ack || busy) return;
    const dataUrl = padRef.current?.toDataURL() || "";
    if (!dataUrl) {
      setError("ارسم توقيعك أولاً أو ارفع صورة توقيع.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/contracts/${encodeURIComponent(shareToken)}/signatures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            party: "party1",
            name: name.trim(),
            signatureData: dataUrl,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "تعذر حفظ التوقيع");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="no-print owner-sign">
      {/* ===== شريط المراحل ===== */}
      <div className="sign-steps" aria-label="مراحل العقد">
        <div className={`sign-step ${stage === 1 ? "active" : stage > 1 ? "done" : ""}`}>
          <i className={stage > 1 ? "fas fa-check" : "fas fa-pen-nib"} />
          <span>١ – التوقيع</span>
        </div>
        <div className={`sign-step ${stage === 2 ? "active" : stage > 2 ? "done" : ""}`}>
          <i className={stage > 2 ? "fas fa-check" : "fas fa-share-nodes"} />
          <span>٢ – مشاركة للتوقيع</span>
        </div>
        <div className={`sign-step ${stage === 3 ? "active" : ""}`}>
          <i className="fas fa-file-circle-check" />
          <span>٣ – العقد النهائي</span>
        </div>
      </div>

      {/* ===== المرحلة ١: توقيع الطرف الأول ===== */}
      {!sig1 && (
        <div className="card signpad-card">
          <div className="signpad-head">
            <span className="signpad-ico">✍️</span>
            <div>
              <b>توقيع الطرف الأول — {party1Name}</b>
              <p>
                وقّع على العقد مباشرة، ثم شارك رابط التوقيع مع الطرف الثاني —
                لا حاجة للنزول للأسفل، الوثيقة أمامك أدناه.
              </p>
            </div>
          </div>

          <SignaturePad
            ref={padRef}
            height={150}
            onChange={setHasInk}
            label="توقيع الطرف الأول"
          />

          <label className="signpad-field-label" htmlFor="ownerSignName">
            الاسم الكامل كما يُدوَّن مع التوقيع
          </label>
          <input
            id="ownerSignName"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />

          <label className="signpad-ack">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span>
              بأني اطّلعت على كامل بنود العقد وفهمت مضمونه وأوافق على الالتزام به،
              وأفهم أن التوقيع يُسجَّل مع الوقت وبيانات الجهاز ورقم IP لأغراض
              الإثبات.
            </span>
          </label>

          {error && <p className="signpad-error">{error}</p>}

          <div className="signpad-actions">
            <button
              className="btn"
              disabled={!hasInk || !name.trim() || !ack || busy}
              onClick={submit}
              type="button"
            >
              <i className="fas fa-check" />{" "}
              {busy ? "جاري الحفظ…" : "توقيع الطرف الأول"}
            </button>
            <a className="btn btn-soft" href="#mithaq-sheet">
              عرض الوثيقة أدناه ↓
            </a>
          </div>
        </div>
      )}

      {/* ===== المرحلة ٢: مشاركة للتوقيع ===== */}
      {sig1 && !sig2 && (
        <div className="card signpad-card signpad-success">
          <div className="signpad-flags">
            <span className="status-badge status-active">✓ {party1Name} — تم التوقيع</span>
            <span className="status-badge status-partial">⏳ {party2Name} — بانتظار التوقيع</span>
          </div>
          <b className="signpad-title">
            <i className="fas fa-paper-plane" />
            أرسل العقد إلى الطرف الثاني للتوقيع
          </b>
          <p className="signpad-sub">
            توقيعك محفوظ. شارك رابط التوقيع المشفّر مع الطرف الثاني ليوقّع من
            جهازه — يتحدّث العقد تلقائياً فور توقيعه.
          </p>

          {/* رابط مشفّر في سطر واحد — نسخ بضغطة */}
          <div className="share-link-box">
            <i className="fas fa-link" />
            <code dir="ltr" title={shareUrl}>
              {shareUrl}
            </code>
            <button type="button" onClick={copyLink} className="share-link-copy">
              {copied ? "✓ تم النسخ" : "نسخ"}
            </button>
          </div>

          <div className="signpad-actions">
            <a className="btn btn-wa" href={waHref} target="_blank" rel="noopener noreferrer">
              <i className="fab fa-whatsapp" /> مشاركة للتوقيع
            </a>
            <button className="btn btn-soft" type="button" onClick={copyLink}>
              <i className="fas fa-link" /> {copied ? "✓ تم نسخ الرابط" : "نسخ رابط التوقيع"}
            </button>
            <a
              className="btn btn-soft"
              href={verifyHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fas fa-shield-halved" /> صفحة التحقق
            </a>
          </div>
        </div>
      )}

      {/* ===== المرحلة ٣: العقد النهائي ===== */}
      {sig1 && sig2 && (
        <div className="card signpad-card signpad-success">
          <b className="signpad-title">
            ✓ العقد النهائي — موقّع من الطرفين
          </b>
          <p className="signpad-sub">
            تم اعتماد الوثيقة وتوقيعها رقمياً من الطرفين مع ختم البصمة SHA-256.
            الوثيقة الكاملة أدناه — اطبعها أو شارك رابط التحقق.
          </p>
          <div className="signpad-actions">
            <button className="btn" type="button" onClick={() => window.print()}>
              <i className="fas fa-print" /> طباعة / PDF
            </button>
            <a className="btn btn-wa" href={waHref} target="_blank" rel="noopener noreferrer">
              <i className="fab fa-whatsapp" /> مشاركة العقد
            </a>
            <a
              className="btn btn-soft"
              href={verifyHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fas fa-shield-halved" /> صفحة التحقق
            </a>
            <a className="btn btn-soft" href="/dashboard">
              <i className="fas fa-arrow-right" /> رجوع للعقود
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
