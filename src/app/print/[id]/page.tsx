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
   محمية بتسجيل الدخول (المالك فقط) وتُولَّد لحظياً من Neon —
   لا ملفات PDF مخزنة: المحتوى في قاعدة البيانات والطباعة
   عبر حوار المتصفح (مجاني ويحافظ على العربية وRTL)
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
        <div style={{ padding: "36px 42px" }}>
          <p
            style={{
              textAlign: "center",
              fontSize: 13,
              fontWeight: 700,
              margin: "0 0 4px",
            }}
          >
            بسم الله الرحمن الرحيم
          </p>
          <h1
            style={{
              textAlign: "center",
              fontSize: 20,
              fontWeight: 900,
              margin: "0 0 2px",
              color: "var(--green)",
            }}
          >
            {contractTypeName(contract.type)}
          </h1>
          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "var(--muted)",
              margin: "0 0 22px",
            }}
          >
            منظومة ميثاق للعقود والتوثيق الإلكتروني · مرجع {ref}
          </p>

          <p style={{ fontSize: 13 }}>
            حُرّر هذا العقد في {contract.city ? contract.city + "، " : ""}بتاريخ{" "}
            <b>{arDate(contract.createdAt)}</b> بين كلٍّ من:
          </p>

          <div className="grid2" style={{ margin: "14px 0 18px" }}>
            <div className="box">
              <b>الطرف الأول</b>
              {contract.party1Name}
            </div>
            <div className="box">
              <b>الطرف الثاني</b>
              {contract.party2Name}
            </div>
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

          <h2 style={{ fontSize: 14, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
            بنود العقد
          </h2>
          <ol className="clauses">
            {clauses.map((cl, i) => (
              <li key={i}>{cl}</li>
            ))}
          </ol>

          {contract.notes && (
            <p style={{ fontSize: 12, marginTop: 12 }}>
              <b>ملاحظات:</b> {contract.notes}
            </p>
          )}

          <p style={{ fontSize: 12.5, marginTop: 18 }}>
            يقر الطرفان بأنهما اطلعا على بنود هذا العقد وفهما مضمونه وقبلا الالتزام به.
          </p>

          <div className="grid2" style={{ marginTop: 34 }}>
            <div className="box">
              <b>توقيع الطرف الأول</b>
              {contract.sig1DataUrl ? (
                <img
                  src={contract.sig1DataUrl}
                  alt="توقيع الطرف الأول"
                  style={{ maxHeight: 60, maxWidth: "90%" }}
                />
              ) : (
                "____________________"
              )}
              <small style={{ display: "block", color: "var(--muted)", fontSize: 10 }}>
                {contract.sig1Name || contract.party1Name}
                {contract.sig1SignedAt ? ` · ${arDate(contract.sig1SignedAt)}` : ""}
              </small>
            </div>
            <div className="box">
              <b>توقيع الطرف الثاني</b>
              {contract.sig2DataUrl ? (
                <img
                  src={contract.sig2DataUrl}
                  alt="توقيع الطرف الثاني"
                  style={{ maxHeight: 60, maxWidth: "90%" }}
                />
              ) : (
                "____________________"
              )}
              <small style={{ display: "block", color: "var(--muted)", fontSize: 10 }}>
                {contract.sig2Name || contract.party2Name}
                {contract.sig2SignedAt ? ` · ${arDate(contract.sig2SignedAt)}` : ""}
              </small>
            </div>
          </div>

          <p
            style={{
              marginTop: 26,
              fontSize: 9.5,
              color: "var(--muted)",
              borderTop: "1px dashed var(--line)",
              paddingTop: 8,
              direction: "ltr",
              textAlign: "left",
            }}
          >
            Ref: {ref} · Fingerprint: {contract.contentHash.toUpperCase()} · Verified via
            miithaq.com/verify/{contract.id}
          </p>
        </div>
      </article>
    </main>
  );
}
