import type { Contract } from "@/db/schema";
import { contractTypeName } from "@/lib/contract-types";
import { arDate } from "@/lib/format";
import { contractVerification, verifyPathFor } from "@/lib/fingerprint";
import type { OfficeBranding } from "@/lib/branding";
import QrCode from "@/components/QrCode";

/* ============================================================
   ContractSheet — ورقة العقد A4 الموحّدة
   نفس تنسيق /print/[id]: شريط زمردي علوي + شعار ميثاق (أو شعار
   المكتب المخصّص حصراً لباقة المكاتب $49) + شهادة إتمام ثنائية
   اللغة (AR/EN) + مرجع التوثيق + رمز QR التحقق.
   ============================================================ */

const TYPE_EN: Record<string, string> = {
  lease: "Residential Lease Agreement",
  sale: "Sale & Purchase Agreement",
  services: "Services Agreement",
  freelance: "Freelance Work Agreement",
  pledge: "Legal Pledge & Undertaking",
  supply: "Supply Agreement",
  partnership: "Partnership Agreement",
  nda: "Non-Disclosure Agreement (NDA)",
  lease_commercial: "Commercial Lease Agreement",
  design: "Design & Development Agreement",
  rent_furnished: "Furnished Property Lease Agreement",
};

export function verifyUrlFor(contract: Contract, baseUrl?: string): string {
  const base = (baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return base + verifyPathFor(contract.shareToken);
}

export default function ContractSheet({
  contract,
  clauses,
  verifyUrl: verifyUrlProp,
  branding,
}: {
  contract: Contract;
  clauses: string[];
  verifyUrl?: string;
  branding?: OfficeBranding | null;
}) {
  const { ref } = contractVerification(contract.id, contract.updatedAt, contract.status);
  const verifyUrl = verifyUrlProp || verifyUrlFor(contract);
  const hash = (contract.contentHash || "").toUpperCase();
  const hasCustomBrand = Boolean(branding && (branding.officeLogo || branding.officeName));
  const enStatus =
    contract.status === "signed"
      ? "Completed & Signed by Both Parties"
      : contract.status === "partially_signed"
        ? "Partially Signed (Awaiting Counterparty)"
        : "Pending Signature";
  const enDate = contract.createdAt
    ? new Date(contract.createdAt).toISOString().slice(0, 10)
    : "—";

  return (
    <article className="card sheet">
      {/* ===== الشريط الزمردي العلوي ===== */}
      <div className="sheet-topband" aria-hidden />

      {/* ===== الترويسة الرسمية (شعار المكتب المخصّص لباقة $49 أو شعار ميثاق) ===== */}
      <header className="sheet-head">
        <div className="sheet-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hasCustomBrand && branding?.officeLogo ? branding.officeLogo : "/mithaq-logo-print.svg"}
            alt={hasCustomBrand && branding?.officeName ? branding.officeName : "شعار ميثاق"}
            className="sheet-logo"
            style={hasCustomBrand ? { objectFit: "contain", borderRadius: 8 } : undefined}
          />
          <div className="sheet-brand-text">
            <b>{hasCustomBrand && branding?.officeName ? branding.officeName : "مِــيــثَــاق"}</b>
            <span>
              {hasCustomBrand
                ? "وثيقة رسمية موثّقة عبر منظومة ميثاق"
                : "منظومة العقود والتوثيق الإلكتروني"}
            </span>
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

        {/* ===== وسيلة التوقيع — بيان صريح لا لبس فيه ===== */}
        <p className="sheet-signing-mode">
          <i className="fas fa-fingerprint" /> وسيلة التوقيع المعتمدة في هذا العقد:
          <b>
            {contract.signingMode === "quick"
              ? "توقيع سريع على نفس الجهاز أمام الطرفين"
              : "إرسال للطرف الثاني عبر رابط خاص، وتوقيعه بحساب Google المحجوز مسبقاً (" +
                (contract.party2Email || "غير محدَّد") +
                ")"}
          </b>
          — وقد وُثّق كل توقيع بحساب المُوقِّع ووقته وبيانات جهازه في سجل الإثبات بالمنصة.
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
              {contract.party2Email ? ` · ${contract.party2Email}` : ""}
            </small>
          </div>
        </div>
      </div>

      {/* ===== شهادة التوثيق والإتمام ثنائية اللغة (AR / EN Certificate of Completion) ===== */}
      <section className="sheet-cert" aria-label="شهادة التوثيق والإتمام — Certificate of Completion">
        <div className="sheet-cert-head">
          <div>
            <strong>شهادة التوثيق والإتمام الرقمي</strong>
            <span>موثّقة عبر منصة ميثاق ببصمة تشفيرية SHA-256</span>
          </div>
          <div dir="ltr" style={{ textAlign: "left" }}>
            <strong>Certificate of Completion</strong>
            <span>Cryptographically Sealed by Mithaq (SHA-256)</span>
          </div>
        </div>
        <div className="sheet-cert-grid">
          <div>
            <small>Document Reference · المرجع</small>
            <b dir="ltr">{ref}</b>
          </div>
          <div>
            <small>Agreement Type · النوع</small>
            <b>
              {contractTypeName(contract.type)} ·{" "}
              <bdi dir="ltr">{TYPE_EN[contract.type] || "Electronic Contract"}</bdi>
            </b>
          </div>
          <div>
            <small>Status · حالة التوقيع</small>
            <b>
              {contract.status === "signed"
                ? "موقّع ومكتمل ✓"
                : contract.status === "partially_signed"
                  ? "توقيع جزئي"
                  : "قيد التوقيع"}{" "}
              · <bdi dir="ltr">{enStatus}</bdi>
            </b>
          </div>
          <div>
            <small>Issue Date · تاريخ التحرير</small>
            <b>
              {arDate(contract.createdAt)} · <bdi dir="ltr">{enDate}</bdi>
            </b>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <small>SHA-256 Tamper-Evident Digest · البصمة الرقمية الكاملة</small>
            <code dir="ltr" className="sheet-cert-hash">
              {hash || "PENDING-HASH"}
            </code>
          </div>
        </div>
      </section>

      {/* ===== تذييل التحقق + رمز QR ===== */}
      <footer className="sheet-foot">
        <div className="sheet-foot-band" aria-hidden />
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
          <code>FP: {hash ? hash.slice(0, 16) + "…" : "—"}</code>
        </div>
      </footer>
    </article>
  );
}
