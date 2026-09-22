"use client";

/* زر الطباعة — يولّد PDF عبر حوار الطباعة في المتصفح
   (يحافظ على العربية وRTL بشكل كامل بلا أي مكتبة خارجية) */
export default function PrintButton({ label = "طباعة / PDF" }: { label?: string }) {
  return (
    <button className="btn no-print" type="button" onClick={() => window.print()}>
      🖨️ {label}
    </button>
  );
}
