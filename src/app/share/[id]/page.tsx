import { notFound } from "next/navigation";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveClauses } from "@/lib/contract-text";
import { contractTypeName } from "@/lib/contract-types";
import { arDate } from "@/lib/format";
import { contractVerification } from "@/lib/fingerprint";
import ShareSignPad from "@/components/signing/ShareSignPad";
import Logo from "@/components/Logo";
import { buildOfficialShareMessage, whatsappLink } from "@/lib/whatsapp";
import { shareUrlFor } from "@/lib/fingerprint";

export const dynamic = "force-dynamic";

/* ============================================================
   /share/[id] — الصفحة العامة التي يفتحها الطرف الثاني من
   جهازه لتوقيع العقد. تقرأ من Neon مباشرة (Server Component)
   والتوقيع يُحفظ عبر /api/contracts/[id]/signatures
   ============================================================ */

type Props = { params: Promise<{ id: string }> };

export default async function SharePage({ params }: Props) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.shareToken, id))
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
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const waHref = whatsappLink(
    buildOfficialShareMessage(contract, shareUrlFor(contract.shareToken, base))
  );

  const statusBadge =
    contract.status === "signed" ? (
      <span className="badge signed">✓ موقّع من الطرفين</span>
    ) : contract.status === "partially_signed" ? (
      <span className="badge partial">⏳ توقيع جزئي — بانتظار الطرف الثاني</span>
    ) : (
      <span className="badge">✎ قيد التوقيع</span>
    );

  return (
    <main style={{ padding: 20 }}>
      <article className="card">
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 22px",
            borderBottom: "1px solid var(--line)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <Logo height={22} />
            <small style={{ display: "block", color: "var(--muted)", fontSize: 11 }}>
              منظومة العقود والتوثيق الإلكتروني
            </small>
          </div>
          {statusBadge}
        </header>

        <div style={{ padding: 22 }}>
          <h2 style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 900 }}>
            {contractTypeName(contract.type)}
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 16px" }}>
            حُرّر بتاريخ {arDate(contract.createdAt)}
          </p>

          <div className="grid2" style={{ marginBottom: 16 }}>
            <div className="box">
              <b>الطرف الأول</b>
              {contract.party1Name}
            </div>
            <div className="box">
              <b>الطرف الثاني</b>
              {contract.party2Name}
            </div>
            {contract.amount && (
              <div className="box">
                <b>القيمة/المبلغ</b>
                {contract.amount}
              </div>
            )}
            {contract.city && (
              <div className="box">
                <b>المدينة</b>
                {contract.city}
              </div>
            )}
            {contract.subject && (
              <div className="box">
                <b>موضوع العقد</b>
                {contract.subject}
              </div>
            )}
            {contract.duration && (
              <div className="box">
                <b>مدة العقد</b>
                {contract.duration}
              </div>
            )}
          </div>

          <h3 style={{ fontSize: 14, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
            بنود العقد
          </h3>
          <ol className="clauses">
            {clauses.map((cl, i) => (
              <li key={i}>{cl}</li>
            ))}
          </ol>

          {contract.notes && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
              <b>ملاحظات:</b> {contract.notes}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 20,
              flexWrap: "wrap",
            }}
          >
            <div className="box">
              <b>توقيع الطرف الأول</b>
              {contract.sig1DataUrl ? (
                <img
                  src={contract.sig1DataUrl}
                  alt="توقيع الطرف الأول"
                  style={{ maxHeight: 56, maxWidth: "90%" }}
                />
              ) : (
                <span style={{ color: "var(--muted)", fontSize: 12 }}>لم يوقع بعد</span>
              )}
            </div>
            <div className="box">
              <b>توقيع الطرف الثاني</b>
              {contract.sig2DataUrl ? (
                <img
                  src={contract.sig2DataUrl}
                  alt="توقيع الطرف الثاني"
                  style={{ maxHeight: 56, maxWidth: "90%" }}
                />
              ) : (
                <span style={{ color: "var(--muted)", fontSize: 12 }}>لم يوقع بعد</span>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#fafafa",
              border: "1px dashed var(--line)",
              fontSize: 11,
              color: "var(--muted)",
              direction: "ltr",
              textAlign: "left",
              unicodeBidi: "embed",
            }}
          >
            Ref: {ref} · FP: {contract.contentHash.slice(0, 24).toUpperCase()}…
          </div>
        </div>
      </article>

      <ShareSignPad
        shareToken={contract.shareToken}
        party2Name={contract.party2Name}
        alreadySigned={Boolean(contract.sig2SignedAt)}
        fullySigned={contract.status === "signed"}
        waHref={waHref}
      />
    </main>
  );
}
