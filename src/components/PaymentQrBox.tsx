"use client";

/* ============================================================
   PaymentQrBox — بطاقة باركود (QR) + رمز الحساب مع النسخ والحفظ
   يولّد رمز QR نقياً يحتوي فقط على رمز الاستقبال (شام كاش أو USDT)
   دون أي نص إضافي حتى يقرأه ماسح تطبيق شام كاش ومحافظ TRON فوراً.
   ============================================================ */

import { useState } from "react";
import QrCode from "@/components/QrCode";
import { qrMatrix } from "@/lib/qr";

export default function PaymentQrBox({
  value,
  accountName,
  caption,
  copyLabel = "نسخ الرمز",
  downloadFileName = "mithaq-payment-qr.png",
  size = 168,
}: {
  value: string;
  accountName?: string;
  caption: string;
  copyLabel?: string;
  downloadFileName?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* احتياطي للمتصفحات القديمة */
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        /* المستخدم ينسخ يدوياً */
      }
    }
  }

  function handleDownloadPng() {
    try {
      const m = qrMatrix(value, { ecc: "M" });
      const quiet = 4;
      const total = m.moduleCount + quiet * 2;
      const scale = Math.max(8, Math.floor(600 / total));
      const dim = total * scale;

      const canvas = document.createElement("canvas");
      canvas.width = dim;
      canvas.height = dim;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, dim, dim);
      ctx.fillStyle = "#0b1f1a";
      for (let r = 0; r < m.moduleCount; r++) {
        for (let c = 0; c < m.moduleCount; c++) {
          if (m.modules[r][c]) {
            ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
          }
        }
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    } catch {
      /* تعذر حفظ الصورة في المتصفح */
    }
  }

  return (
    <div className="payqr-box">
      <div className="payqr-frame">
        <QrCode value={value} size={size} ink="#0b1f1a" label={caption} />
      </div>

      <div className="payqr-caption">
        <i className="fas fa-qrcode" />
        <span>{caption}</span>
      </div>

      {accountName && (
        <div className="payqr-name">
          <span>اسم الحساب:</span> <b>{accountName}</b>
        </div>
      )}

      <div className="payqr-code-row">
        <code dir="ltr">{value}</code>
      </div>

      <div className="payqr-actions">
        <button type="button" className="payqr-btn primary" onClick={handleCopy}>
          <i className={`fas ${copied ? "fa-check" : "fa-copy"}`} />
          {copied ? "تم النسخ ✓" : copyLabel}
        </button>
        <button type="button" className="payqr-btn soft" onClick={handleDownloadPng}>
          <i className="fas fa-download" />
          حفظ الباركود
        </button>
      </div>
    </div>
  );
}
