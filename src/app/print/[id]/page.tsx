import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveClauses } from "@/lib/contract-text";
import { contractTypeName } from "@/lib/contract-types";
import { arDate } from "@/lib/format";
import { contractVerification } from "@/lib/fingerprint";
import PrintButton from "@/components/print/PrintButton";

export const dynamic = "force-dynamic";

/* ============================================================
   /print/[id] — نسخة A4 مخصصة للطباعة/حفظ PDF
   ترويسة رسمية أنيقة: شريط زمردي علوي + شعار ميثاق الشفاف +
   اسم المنظومة + مرجع التوثيق، ثم مخطط العقد بخط مزدوج فاخر.
   محمية بتسجيل الدخول (المالك فقط) وتُولَّد لحظياً من Neon.
   ============================================================ */

type Props = { params: Promise<{ id: string }> };

export default async function PrintPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/login");

  const { id } = await params;

  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, id), eq(contracts.ownerId, session.user.dbId)))
    .limit(1);
  const contract = rows[0];
  if (!contract) notFound();

  const clauses = resolveClauses({
    type: contract.type,
    party1Name: contract.party1Name,
    party2Name: contract.party2Name,
    amount: contract.amount,
    city: contract.city,
    subject: contract.subject,
    duration: contract.duration,
    paymentMethod: contract.paymentMethod,
    clauses: contract.clauses,
    date: contract.createdAt,
  });

  const { ref } = contractVerification(contract.id, contract.updatedAt, contract.status);

  return (
    <main style={{ padding: 20 }}>
      <div
        className="no-print"
        style={{
          maxWidth: 800,
          margin: "0 auto 14px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <PrintButton />
        <a className="btn btn-soft" href="/">
          ← رجوع للعقود
        </a>
        <small style={{ color: "var(--muted)" }}>
          اختر «حفظ كـ PDF» من حوار الطباعة للحصول على نسخة رقمية
        </small>
      </div>

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
            عقد إلكتروني موثّق — حرر بتاريخ{" "}
            <b>{arDate(contract.createdAt)}</b>
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

        {/* ===== تذييل التحقق ===== */}
        <footer className="sheet-foot">
          <div className="sheet-foot-inner">
            <div>
              <b>التحقق من سلامة الوثيقة</b>
              <span>
                امسح الرمز أو زر miithaq.com/verify/{contract.id}
              </span>
            </div>
            <code>FP: {contract.contentHash.toUpperCase().slice(0, 16)}…</code>
          </div>
        </footer>
      </article>
    </main>
  );
}
