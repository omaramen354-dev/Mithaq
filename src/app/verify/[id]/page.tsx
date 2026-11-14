import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { contracts, signatureEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { contractTypeName } from "@/lib/contract-types";
import { arDate, arDateTime, maskEmail } from "@/lib/format";
import { isOwnerSuspended } from "@/lib/mithaq-guard";
import SuspendedScreen from "@/components/SuspendedScreen";
import Logo from "@/components/Logo";
import { decodeShareToken, encodeShareToken } from "@/lib/share-token";
import { contractFingerprint } from "@/lib/contract-hash";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "التحقق من العقد — ميثاق",
  robots: { index: false, follow: false },
};

/* ============================================================
   /verify/[id] — صفحة التحقق العامة من بصمة العقد (SHA-256)
   تعرض حالة مطابقة البصمة دون أي بيانات مالية حساسة
   ============================================================ */

type Props = { params: Promise<{ id: string }> };

export default async function VerifyPage({ params }: Props) {
  const { id: rawId } = await params;
  const id = decodeShareToken(rawId);

  const rows = await db
    .select({
      id: contracts.id,
      type: contracts.type,
      status: contracts.status,
      party1Name: contracts.party1Name,
      party2Name: contracts.party2Name,
      amount: contracts.amount,
      duration: contracts.duration,
      paymentMethod: contracts.paymentMethod,
      city: contracts.city,
      subject: contracts.subject,
      notes: contracts.notes,
      createdAt: contracts.createdAt,
      sig1Name: contracts.sig1Name,
      sig1DataUrl: contracts.sig1DataUrl,
      sig1SignedAt: contracts.sig1SignedAt,
      sig2Name: contracts.sig2Name,
      sig2DataUrl: contracts.sig2DataUrl,
      sig2SignedAt: contracts.sig2SignedAt,
      signingMode: contracts.signingMode,
      party2Email: contracts.party2Email,
      party2GoogleId: contracts.party2GoogleId,
      content: contracts.content,
      clauses: contracts.clauses,
      contentHash: contracts.contentHash,
    })
    .from(contracts)
    .where(eq(contracts.shareToken, id))
    .limit(1);

  const c = rows[0];
  if (!c) notFound();

  /* سجل الإثبات: كل توقيع مع حسابه ووقته — البريد مموّه للعموم */
  const events = await db
    .select()
    .from(signatureEvents)
    .where(eq(signatureEvents.contractId, c.id))
    .orderBy(signatureEvents.signedAt);

  const signingModeLabel =
    c.signingMode === "quick"
      ? "توقيع سريع على نفس الجهاز"
      : "إرسال للطرف الثاني عبر الرابط + دخول بحساب Google";

  /* فحص الحجب — صاحب العقد مجمّد؟ نُحجب كل شيء فوراً قبل أي حساب */
  const guard = await isOwnerSuspended(c.id);
  if (guard.suspended) return <SuspendedScreen />;

  const current = contractFingerprint({
    id: c.id,
    type: c.type,
    party1Name: c.party1Name,
    party2Name: c.party2Name,
    amount: c.amount,
    date: c.createdAt,
    duration: c.duration,
    paymentMethod: c.paymentMethod,
    city: c.city,
    subject: c.subject,
    notes: c.notes,
    clauses: c.clauses,
    content: c.content,
    signingMode: c.signingMode,
    party2Email: c.party2Email,
    party2GoogleId: c.party2GoogleId,
    status: c.status,
    sig1Name: c.sig1Name,
    sig1DataUrl: c.sig1DataUrl,
    sig1SignedAt: c.sig1SignedAt,
    sig2Name: c.sig2Name,
    sig2DataUrl: c.sig2DataUrl,
    sig2SignedAt: c.sig2SignedAt,
  });
  const matched = Boolean(c.contentHash) && current === c.contentHash;
  const hasHash = Boolean(c.contentHash);

  const lastSign = c.sig2SignedAt || c.sig1SignedAt;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 560 }}>
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
              boxShadow: "0 2px 10px rgba(7,31,26,0.25)",
            }}
          >
            <Logo height={20} />
          </span>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            خدمة التحقق من العقود الرقمية
          </small>
        </div>

        <div style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "14px 16px",
              borderRadius: 14,
              border: "1.5px solid",
              borderColor: matched ? "#bfe3cd" : hasHash ? "#f5c2c2" : "#e5e0d0",
              background: matched ? "#e9f6ee" : hasHash ? "#fdecec" : "#f7f5ec",
              color: matched ? "#157347" : hasHash ? "#b91c1c" : "#8a7f5e",
              fontWeight: 800,
            }}
          >
            <span style={{ fontSize: 22 }}>{matched ? "✓" : hasHash ? "✕" : "—"}</span>
            <div>
              <b style={{ display: "block", fontSize: 15 }}>
                {matched
                  ? "عقد موثق وسليم 100%"
                  : hasHash
                    ? "هذا العقد غير مطابق للبصمة الأصلية"
                    : "لا توجد بصمة رقمية مسجّلة لهذا العقد"}
              </b>
              <small style={{ fontWeight: 600, fontSize: 11 }}>
                {matched
                  ? "البصمة الرقمية مطابقة للأصل المخزّن"
                  : hasHash
                    ? "رُصد تلاعب أو تعديل غير معتمد على المحتوى"
                    : "أُنشئ هذا العقد في إصدار قديم من المنصة قبل اعتماد البصمة الرقمية"}
              </small>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 18 }}>
            <tbody>
              {[
                ["نوع العقد", contractTypeName(c.type)],
                ["الطرف الأول", c.party1Name],
                ["الطرف الثاني", c.party2Name],
                ["تاريخ التحرير", arDate(c.createdAt)],
                ["تاريخ التوقيع", lastSign ? arDate(lastSign) : "—"],
                [
                  "حالة التوقيع",
                  c.status === "signed"
                    ? "موقّع من الطرفين"
                    : c.status === "partially_signed"
                      ? "توقيع جزئي"
                      : "قيد التوقيع",
                ],
                ["وسيلة التوقيع المعتمدة", signingModeLabel],
                [
                  "البريد المحجوز للطرف الثاني",
                  c.party2Email ? (
                    <bdi dir="ltr" style={{ fontWeight: 700 }}>
                      {maskEmail(c.party2Email)}
                    </bdi>
                  ) : (
                    "غير محجوز"
                  ),
                ],
              ].map(([k, v]) => (
                <tr key={String(k)} style={{ borderBottom: "1px solid var(--line)" }}>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "9px 4px",
                      color: "var(--muted)",
                      fontSize: 11,
                      width: "38%",
                    }}
                  >
                    {k}
                  </th>
                  <td style={{ textAlign: "right", padding: "9px 4px", fontWeight: 700 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ===== سجل التوقيع (سجل الإثبات) ===== */}
          {events.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <small
                style={{
                  display: "block",
                  color: "var(--muted)",
                  fontWeight: 800,
                  fontSize: 11,
                  marginBottom: 6,
                }}
              >
                <i className="fas fa-clipboard-check" /> سجل التوقيع — لكل توقيع الحساب والوقت
                (البريد مموّه لحماية الخصوصية)
              </small>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ background: "#f7f5ec" }}>
                    {['الطرف', 'الاسم المُدوَّن', 'الحساب الموثّق', 'وقت التوقيع'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "7px 8px",
                          textAlign: "right",
                          fontSize: 10,
                          color: "var(--muted)",
                          borderBottom: "1px solid var(--line)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>
                        {ev.party === "party1" ? "الطرف الأول" : "الطرف الثاني"}
                      </td>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{ev.signerName}</td>
                      <td style={{ padding: "7px 8px" }}>
                        {ev.signerEmail ? (
                          <bdi dir="ltr" style={{ fontWeight: 700 }}>
                            {maskEmail(ev.signerEmail)}
                          </bdi>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>
                        {arDateTime(ev.signedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              padding: "14px 16px",
              borderRadius: 12,
              border: "1.5px solid " + (matched ? "#157347" : hasHash ? "#b91c1c" : "#8a7f5e"),
              background: matched ? "#f2fbf5" : hasHash ? "#fdf2f2" : "#f7f5ec",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: "1px dashed rgba(15, 61, 46, 0.16)",
              }}
            >
              <strong style={{ fontSize: 12.5, color: "#0b3d2e" }}>
                شهادة التوثيق الرقمي
              </strong>
              <strong dir="ltr" style={{ fontSize: 11.5, color: "#0b3d2e" }}>
                Certificate of Completion · SHA-256
              </strong>
            </div>
            <div
              dir="ltr"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: 11,
                color: "#365046",
                marginBottom: 10,
              }}
            >
              <div>
                <div style={{ color: "var(--muted)", fontSize: 10 }}>Verification Status</div>
                <b style={{ color: matched ? "#157347" : hasHash ? "#b91c1c" : "#8a7f5e" }}>
                  {matched ? "VALID · Integrity Verified" : hasHash ? "MISMATCH · Tampered" : "Pending Hash"}
                </b>
              </div>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 10 }}>Signature State</div>
                <b>
                  {c.status === "signed"
                    ? "Completed (2/2 Parties)"
                    : c.status === "partially_signed"
                      ? "Partially Signed (1/2)"
                      : "Pending Signature"}
                </b>
              </div>
            </div>
            <small style={{ display: "block", color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>
              بصمة المحتوى الرقمية الكاملة — Full SHA-256 Digest
            </small>
            <code
              style={{
                direction: "ltr",
                display: "block",
                fontSize: 11.5,
                fontWeight: 800,
                wordBreak: "break-all",
                color: matched ? "#157347" : hasHash ? "#b91c1c" : "#8a7f5e",
              }}
            >
              {c.contentHash
                ? c.contentHash.toUpperCase()
                : "غير مسجّلة لهذا العقد — Pending"}
            </code>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <Link
              className="btn"
              href={`/share/${encodeURIComponent(encodeShareToken(id))}`}
            >
              عرض العقد كاملاً
            </Link>
          </div>
        </div>

        <div
          style={{
            padding: "12px 22px",
            borderTop: "1px solid var(--line)",
            textAlign: "center",
            fontSize: 10,
            color: "var(--muted)",
          }}
        >
          🛡️ يتحقق هذا الرابط من مطابقة محتوى العقد للبصمة المخزّنة — منصة ميثاق
        </div>
      </div>
    </main>
  );
}
