"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contract } from "@/db/schema";
import { contractTypeName } from "@/lib/contract-types";
import { arDate } from "@/lib/format";
import { contractVerification } from "@/lib/fingerprint";
import { buildOfficialShareMessage, whatsappLink } from "@/lib/whatsapp";

/* ============================================================
   ContractsTable — جدول العقود بتصميم v1 الأسطوري
   صفوف grid بنفس أعمدة الجدول الأصلي، شارات نوع ملونة،
   شارات حالة بنقطة، وأيقونات إجراءات دائرية.
   ============================================================ */

const TYPE_BADGE: Record<string, string> = {
  lease: "type-rent",
  sale: "type-sale",
  services: "type-service",
  freelance: "type-freelance",
  pledge: "type-pledge",
  supply: "type-supply",
  partnership: "type-partnership",
  nda: "type-nda",
  lease_commercial: "type-rent",
  design: "type-service",
  rent_furnished: "type-rent",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "signed")
    return (
      <span className="status-badge status-active">موقّع من الطرفين</span>
    );
  if (status === "partially_signed")
    return <span className="status-badge status-partial">توقيع جزئي</span>;
  return <span className="status-badge status-draft">قيد التوقيع</span>;
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
    if (!window.confirm("سيتم حذف العقد نهائياً مع توقيعاته. هل أنت متأكد؟"))
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
      <div className="contracts-table" style={{ padding: "40px 22px", textAlign: "center" }}>
        <i
          className="fas fa-file-circle-plus"
          style={{ fontSize: 34, color: "var(--gold)", marginBottom: 12 }}
        />
        <p style={{ fontWeight: 800, color: "var(--green)", fontSize: 15 }}>
          لا توجد عقود بعد
        </p>
        <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 6 }}>
          ابدأ بإنشاء أول عقد لك الآن — منصة ميثاق جاهزة لخدمتك
        </p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p style={{ color: "#c94a4a", fontWeight: 800, fontSize: 12.5, marginBottom: 10 }}>
          {error}
        </p>
      )}
      <div className="contracts-table">
        <div className="table-header">
          <div>العقد</div>
          <div>نوع العقد</div>
          <div>الحالة</div>
          <div>التاريخ</div>
          <div>إجراءات</div>
        </div>
        {contracts.map((c) => {
          const { ref } = contractVerification(c.id, c.updatedAt, c.status);
          return (
            <div className="table-row" key={c.id}>
              <div style={{ overflow: "hidden" }}>
                <div className="contract-title">
                  {c.party1Name} × {c.party2Name}
                </div>
                <div className="contract-parties" style={{ fontFamily: "var(--font-cairo)", direction: "ltr", textAlign: "right" }}>
                  {ref} · {c.amount || "بدون قيمة"}
                </div>
              </div>
              <div>
                <span className={`type-badge ${TYPE_BADGE[c.type] || "type-other"}`}>
                  {contractTypeName(c.type)}
                </span>
              </div>
              <div>
                <StatusBadge status={c.status} />
              </div>
              <div>
                <span className="date-text">{arDate(c.createdAt)}</span>
              </div>
              <div>
                <div className="row-actions">
                  <Link
                    className="action-icon"
                    href={`/share/${c.shareToken}`}
                    title="إرسال للطرف الثاني — صفحة التوقيع"
                  >
                    <i className="fas fa-paper-plane" />
                  </Link>
                  <a
                    className="action-icon"
                    href={waHref(c)}
                    target="_blank"
                    rel="noopener"
                    title="مشاركة عبر واتساب"
                  >
                    <i className="fab fa-whatsapp" />
                  </a>
                  <Link
                    className="action-icon"
                    href={`/print/${c.id}`}
                    title="طباعة / PDF"
                  >
                    <i className="fas fa-print" />
                  </Link>
                  <Link
                    className="action-icon"
                    href={`/verify/${c.shareToken}`}
                    title="التحقق من البصمة"
                  >
                    <i className="fas fa-shield-halved" />
                  </Link>
                  <button
                    className="action-icon danger"
                    type="button"
                    disabled={deleting === c.shareToken}
                    onClick={() => handleDelete(c.shareToken)}
                    title="حذف العقد نهائياً"
                  >
                    <i className="fas fa-trash-can" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
