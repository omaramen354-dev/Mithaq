import type { Contract } from "@/db/schema";
import { contractTypeName } from "@/lib/contract-types";
import { arDate } from "@/lib/format";
import { contractVerification } from "@/lib/fingerprint";
import QrCode from "@/components/QrCode";

/* ============================================================
   ContractSheet — ورقة العقد A4 الموحّدة
   نفس تنسيق /print/[id]: شريط زمردي علوي + شعار ميثاق الشفاف +
   مرجع التوثيق + رمز QR التحقق — تُستخدم في صفحة الطباعة
   وفي صفحة التوقيع /sign/[id] لضمان تنسيق واحد لكل المخرجات.
   ============================================================ */

export function verifyUrlFor(contract: Contract): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return base + "/verify/" + encodeURIComponent(contract.shareToken);
}

export default function ContractSheet({
  contract,
  clauses,
}: {
  contract: Contract;
  clauses: string[];
}) {
  const { ref } = contractVerification(contract.id, contract.updatedAt, contract.status);
  const verifyUrl = verifyUrlFor(contract);

  return (
    <article className="card sheet">
      {/* ===== الشريط الزمردي العلوي ===== */}
      <div className="sheet-topband" aria-hidden />

      {/* ===== الترويسة الرسمية ===== */}
      <header className="sheet-head">
        <div className="sheet-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mithaq-logo-transparent.svg"
            alt="شعار ميثاق"
            className="sheet-logo"
          />
          <div className="sheet-brand-text">
            <b>مِــيــثَــاق</b>
            <span>منظومة العقود والتوثيق الإلكتروني</span>
          </div>
        </div>
        <div className="sheet-ref">
          <span>مرجع الوثيقة</span>
          <b>{ref}</b>
        </div>
      </header>

      <div className="sheet-rule" aria-hidden>
        <span />
        <i className="fas fa-scale-balanced" />
        <span />
      </div>

      <div className="sheet-body">
        <p className="sheet-bismillah">بسم الله الرحمن الرحيم</p>
        <h1 className="sheet-title">{contractTypeName(contract.type)}</h1>
        <p className="sheet-subtitle">
          عقد إلكتروني موثّق — حرر بتاريخ <b>{arDate(contract.createdAt)}</b>
          {contract.city ? ` في ${contract.city}` : ""}
        </p>

        <p className="sheet-intro">
          حُرّر هذا العقد بناءً على الرضا والاتفاق المتبادل بين كلٍّ من:
        </p>

        <div className="grid2 sheet-parties">
          <div className="box">
            <b>الطرف الأول</b>
            {contract.party1Name}
          </div>
          <div className="box">
            <b>الطرف الثاني</b>
            {contract.party2Name}
          </div>
        </div>

        <div className="grid2 sheet-parties">
          {contract.subject && (
            <div className="box" style={{ gridColumn: "1 / -1" }}>
              <b>موضوع العقد</b>
              {contract.subject}
            </div>
          )}
          {contract.amount && (
            <div className="box">
              <b>القيمة/المبلغ</b>
              {contract.amount}
            </div>
          )}
          {contract.duration && (
            <div className="box">
              <b>مدة العقد</b>
              {contract.duration}
            </div>
          )}
          {contract.paymentMethod && (
            <div className="box">
              <b>طريقة السداد</b>
              {contract.paymentMethod}
            </div>
          )}
        </div>

        <h2 className="sheet-section-title">
          <span>بنود العقد</span>
        </h2>
        <ol className="clauses">
          {clauses.map((cl, i) => (
            <li key={i}>{cl}</li>
          ))}
        </ol>

        {contract.notes && (
          <p className="sheet-notes">
            <b>ملاحظات:</b> {contract.notes}
          </p>
        )}

        <p className="sheet-ack">
          يقر الطرفان بأنهما اطلعا على بنود هذا العقد وفهما مضمونه وقبلا
          الالتزام به كاملًا ودون تحفظ، ووقّعا عليه بإرادتهما الحرة.
        </p>

        {/* ===== التوقيعات ===== */}
        <div className="grid2 sheet-sign">
          <div className="box sig-box">
            <b>توقيع الطرف الأول</b>
            {contract.sig1DataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contract.sig1DataUrl}
                alt="توقيع الطرف الأول"
                style={{ maxHeight: 60, maxWidth: "90%", objectFit: "contain" }}
              />
            ) : (
              <span className="sig-line" />
            )}
            <small>
              {contract.sig1Name || contract.party1Name}
              {contract.sig1SignedAt ? ` · ${arDate(contract.sig1SignedAt)}` : ""}
            </small>
          </div>
          <div className="box sig-box">
            <b>توقيع الطرف الثاني</b>
            {contract.sig2DataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contract.sig2DataUrl}
                alt="توقيع الطرف الثاني"
                style={{ maxHeight: 60, maxWidth: "90%", objectFit: "contain" }}
              />
            ) : (
              <span className="sig-line" />
            )}
            <small>
              {contract.sig2Name || contract.party2Name}
              {contract.sig2SignedAt ? ` · ${arDate(contract.sig2SignedAt)}` : ""}
            </small>
          </div>
        </div>
      </div>

      {/* ===== تذييل التحقق + رمز QR ===== */}
      <footer className="sheet-foot">
        <div className="sheet-foot-inner">
          <div className="sheet-foot-qr">
            <QrCode value={verifyUrl} size={86} label="امسح للتحقق من العقد" />
            <span>
              امسح الرمز لفتح صفحة التحقق العامة — <bdi dir="ltr">{verifyUrl.replace(/^https?:\/\//, "")}</bdi>
            </span>
          </div>
          <div>
            <b>التحقق من سلامة الوثيقة</b>
            <span>أي تغيير في نص العقد يغيّر البصمة فوراً</span>
          </div>
          <code>FP: {contract.contentHash.toUpperCase().slice(0, 16)}…</code>
        </div>
      </footer>
    </article>
  );
}
