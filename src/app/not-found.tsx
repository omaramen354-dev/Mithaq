import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "الصفحة غير موجودة — ميثاق",
  robots: { index: false, follow: false },
};

/* ============================================================
   404 — صفحة عربية أنيقة بهوية ميثاق بدل صفحة Next.js الافتراضية
   ============================================================ */

export default function NotFound() {
  return (
    <main className="admin-gate">
      <div className="admin-gate-card" style={{ maxWidth: 460 }}>
        <div className="admin-gate-icon">
          <i className="fas fa-compass" />
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: "var(--gold-dark)",
            letterSpacing: 1.5,
            marginBottom: 4,
          }}
        >
          404 — ميثاق
        </div>
        <h1>الصفحة غير موجودة</h1>
        <p>
          الرابط الذي فتحته غير صحيح أو لم يعد متاحاً. يمكنك العودة للصفحة
          الرئيسية أو تصفّح قوالب العقود الجاهزة.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
          <Link className="btn btn-primary" href="/">
            <i className="fas fa-house" />
            الرئيسية
          </Link>
          <Link className="btn btn-soft" href="/contracts">
            <i className="fas fa-file-contract" />
            قوالب العقود
          </Link>
        </div>
      </div>
    </main>
  );
}
