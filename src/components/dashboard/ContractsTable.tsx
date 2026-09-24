"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contract } from "@/db/schema";
import { contractTypeName, statusLabel } from "@/lib/contract-types";
import { arDate } from "@/lib/format";
import { contractVerification } from "@/lib/fingerprint";
import { buildOfficialShareMessage, whatsappLink } from "@/lib/whatsapp";

/* ============================================================
   ContractsTable — جدول عقود المستخدم في لوحة التحكم
   /share/[id]    → إرسال/توقيع (shareToken — الرابط العام)
   /print/[id]    → طباعة/PDF (UUID العقد — صفحة محمية للمالك)
   /verify/[id]   → التحقق من البصمة (shareToken)
   حذف/تعديل عبر /api/contracts/[id] (shareToken)
   ============================================================ */

function statusBadge(status: string) {
  if (status === "signed")
    return <span className="badge signed">✓ موقّع من الطرفين</span>;
  if (status === "partially_signed")
    return <span className="badge partial">⏳ توقيع جزئي</span>;
  return <span className="badge">✎ قيد التوقيع</span>;
}

export default function ContractsTable({
  contracts,
}: {
  contracts: Contract[];
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

  async function handleDelete(shareToken: string) {
    if (
      !window.confirm(
        "سيتم حذف العقد نهائياً مع توقيعاته. هل أنت متأكد؟"
      )
    )
      return;
    setDeleting(shareToken);
    setError("");
    try {
      const res = await fetch(
        `/api/contracts/${encodeURIComponent(shareToken)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.message || "تعذر حذف العقد");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  function waHref(c: Contract): string {
    return whatsappLink(
      buildOfficialShareMessage(c, `${baseUrl}/share/${c.shareToken}`)
    );
  }

  if (!contracts.length) {
    return (
      <section className="card" style={{ padding: 28, textAlign: "center" }}>
        <b style={{ fontSize: 15 }}>لا توجد عقود بعد</b>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0" }}>
          أنشئ عقدك الأول من النموذج أعلاه، وسيظهر هنا فوراً مع رابط التوقيع والطباعة.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "14px 20px",
          borderBottom: "1px solid var(--line)",
          flexWrap: "wrap",
        }}
      >
        <b style={{ fontSize: 15 }}>عقودي ({contracts.length})</b>
        {error && (
          <small style={{ color: "#b91c1c", fontWeight: 700, fontSize: 12 }}>
            {error}
          </small>
        )}
      </header>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12.5,
            minWidth: 720,
          }}
        >
          <thead>
            <tr style={{ background: "#fafafa", borderBottom: "1px solid var(--line)" }}>
              {["نوع العقد", "الأطراف", "القيمة", "الحالة", "التاريخ", "إجراءات"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "right",
                      padding: "10px 12px",
                      color: "var(--muted)",
                      fontSize: 11,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const { ref } = contractVerification(c.id, c.updatedAt, c.status);
              const sharePath = `/share/${c.shareToken}`;
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 800, whiteSpace: "nowrap" }}>
                    {contractTypeName(c.type)}
                    <small
                      style={{
                        display: "block",
                        color: "var(--muted)",
                        fontSize: 10,
                        fontWeight: 600,
                        direction: "ltr",
                        textAlign: "right",
                      }}
                    >
                      {ref}
                    </small>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "block" }}>{c.party1Name}</span>
                    <small style={{ color: "var(--muted)" }}>
                      ⇠ {c.party2Name}
                    </small>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    {c.amount || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    {statusBadge(c.status)}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--muted)" }}>
                    {arDate(c.createdAt)}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Link
                        className="btn"
                        style={{ padding: "7px 12px", fontSize: 12 }}
                        href={sharePath}
                        title="إرسال للطرف الثاني — صفحة التوقيع العامة"
                      >
                        ✉️ إرسال / توقيع
                      </Link>
                      <a
                        className="btn btn-wa"
                        style={{ padding: "7px 12px", fontSize: 12 }}
                        href={waHref(c)}
                        target="_blank"
                        rel="noopener"
                        title="مشاركة رابط العقد عبر واتساب"
                      >
                        💬
                      </a>
                      <Link
                        className="btn btn-soft"
                        style={{ padding: "7px 12px", fontSize: 12 }}
                        href={`/print/${c.id}`}
                        title="طباعة / حفظ PDF (للمالك)"
                      >
                        🖨️ طباعة
                      </Link>
                      <Link
                        className="btn btn-soft"
                        style={{ padding: "7px 12px", fontSize: 12 }}
                        href={`/verify/${c.shareToken}`}
                        title="صفحة التحقق من بصمة العقد"
                      >
                        🛡️ تحقق
                      </Link>
                      <button
                        className="btn btn-soft"
                        style={{
                          padding: "7px 12px",
                          fontSize: 12,
                          color: "#b91c1c",
                        }}
                        type="button"
                        disabled={deleting === c.shareToken}
                        onClick={() => handleDelete(c.shareToken)}
                        title="حذف العقد نهائياً"
                      >
                        {deleting === c.shareToken ? "…" : "🗑️ حذف"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer
        style={{
          padding: "10px 20px",
          borderTop: "1px solid var(--line)",
          color: "var(--muted)",
          fontSize: 11,
        }}
      >
        «إرسال / توقيع» يفتح رابط الطرف الثاني ({statusLabel("draft")} → توقيع جزئي → موقّع من
        الطرفين) · «طباعة» للمالك فقط · «تحقق» يعتمد بصمة SHA-256.
      </footer>
    </section>
  );
}
