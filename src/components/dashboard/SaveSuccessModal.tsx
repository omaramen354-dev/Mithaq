"use client";

import { useEffect } from "react";
import { contractTypeName } from "@/lib/contract-types";
import { buildOfficialShareMessage, whatsappLink } from "@/lib/whatsapp";

/* ============================================================
   SaveSuccessModal — شاشة نجاح احتفالية بعد حفظ العقد
   تعرض البصمة (SHA-256) مع نسخها، ورابط المشاركة مع نسخه،
   وزر إرسال واتساب للطرف الثاني، وزر الطباعة/PDF.
   ============================================================ */

type SavedContract = {
  id: string;
  type: string;
  party1Name: string;
  party2Name: string;
  status: string;
  contentHash?: string | null;
  updatedAt?: string | Date | null;
};

export default function SaveSuccessModal({
  contract,
  shareUrl,
  onClose,
}: {
  contract: SavedContract;
  shareUrl: string;
  onClose: () => void;
}) {
  /* إغلاق بـ Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy(text: string, btn: HTMLButtonElement, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "✓ تم النسخ";
      setTimeout(() => (btn.textContent = old), 1600);
    } catch {
      btn.textContent = "انسخ يدوياً";
      setTimeout(() => (btn.textContent = label), 1600);
    }
  }

  const waHref = whatsappLink(
    buildOfficialShareMessage(
      {
        id: contract.id,
        type: contract.type,
        party1Name: contract.party1Name,
        party2Name: contract.party2Name,
        status: contract.status,
        updatedAt: contract.updatedAt,
      },
      shareUrl
    )
  );

  const hash = contract.contentHash || "";

  return (
    <div
      className="success-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="تم حفظ العقد بنجاح"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="success-card">
        <div className="success-check">
          <i className="fas fa-check" />
        </div>

        <h3 className="success-title">تم حفظ عقدك بنجاح</h3>
        <p className="success-sub">
          عقد {contractTypeName(contract.type)} — {contract.party1Name} مع{" "}
          {contract.party2Name}
        </p>

        {hash && (
          <div className="success-block">
            <div className="success-block-label">
              <i className="fas fa-fingerprint" /> بصمة التوثيق SHA-256
            </div>
            <div className="success-block-row">
              <code className="mono">{hash.slice(0, 24)}…{hash.slice(-8)}</code>
              <button
                type="button"
                className="success-copy"
                title="نسخ البصمة كاملة"
                onClick={(e) => copy(hash, e.currentTarget, "نسخ")}
              >
                نسخ
              </button>
            </div>
          </div>
        )}

        <div className="success-block">
          <div className="success-block-label">
            <i className="fas fa-link" /> رابط مشاركة العقد
          </div>
          <div className="success-block-row">
            <code className="mono" dir="ltr">
              {shareUrl.replace(/^https?:\/\//, "")}
            </code>
            <button
              type="button"
              className="success-copy"
              onClick={(e) => copy(shareUrl, e.currentTarget, "نسخ")}
            >
              نسخ
            </button>
          </div>
        </div>

        <div className="success-actions">
          <a
            className="btn btn-primary"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fab fa-whatsapp" />
            إرسال للطرف الثاني
          </a>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => window.location.assign(`/print/${contract.id}`)}
          >
            <i className="fas fa-print" />
            طباعة / PDF
          </button>
        </div>

        <button type="button" className="success-close" onClick={onClose}>
          متابعة
        </button>
      </div>
    </div>
  );
}
