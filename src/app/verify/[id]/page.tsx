import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { contractTypeName } from "@/lib/contract-types";
import { arDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/* ============================================================
   /verify/[id] — صفحة التحقق العامة من بصمة العقد (SHA-256)
   تعرض حالة مطابقة البصمة دون أي بيانات مالية حساسة
   ============================================================ */

type Props = { params: Promise<{ id: string }> };

export default async function VerifyPage({ params }: Props) {
  const { id } = await params;

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
      sig1SignedAt: contracts.sig1SignedAt,
      sig2SignedAt: contracts.sig2SignedAt,
      content: contracts.content,
      clauses: contracts.clauses,
      contentHash: contracts.contentHash,
    })
    .from(contracts)
    .where(eq(contracts.shareToken, id))
    .limit(1);

  const c = rows[0];
  if (!c) notFound();

  const { contractFingerprint } = await import("@/lib/fingerprint");
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
  });
  const matched = current === c.contentHash;

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
          <b style={{ fontSize: 16, fontWeight: 900 }}>مِــيــثَــاق</b>
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
              borderColor: matched ? "#bfe3cd" : "#f5c2c2",
              background: matched ? "#e9f6ee" : "#fdecec",
              color: matched ? "#157347" : "#b91c1c",
              fontWeight: 800,
            }}
          >
            <span style={{ fontSize: 22 }}>{matched ? "✓" : "✕"}</span>
            <div>
              <b style={{ display: "block", fontSize: 15 }}>
                {matched ? "عقد موثق وسليم 100%" : "هذا العقد غير مطابق للبصمة الأصلية"}
              </b>
              <small style={{ fontWeight: 600, fontSize: 11 }}>
                {matched
                  ? "البصمة الرقمية مطابقة للأصل المخزّن"
                  : "رُصد تلاعب أو تعديل غير معتمد على المحتوى"}
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
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: "1px solid var(--line)" }}>
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

          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1.5px dashed " + (matched ? "#157347" : "#b91c1c"),
              background: matched ? "#f2fbf5" : "#fdf2f2",
            }}
          >
            <small style={{ display: "block", color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>
              بصمة المحتوى الرقمية (SHA-256)
            </small>
            <code
              style={{
                direction: "ltr",
                display: "block",
                fontSize: 12,
                fontWeight: 800,
                wordBreak: "break-all",
                color: matched ? "#157347" : "#b91c1c",
              }}
            >
              {c.contentHash.slice(0, 16).toUpperCase()}…
            </code>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <Link className="btn" href={`/share/${id}`}>
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
