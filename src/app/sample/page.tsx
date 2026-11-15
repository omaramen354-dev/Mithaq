import Link from "next/link";
import type { Metadata } from "next";
import type { Contract } from "@/db/schema";
import { resolveClauses } from "@/lib/contract-text";
import { contractFingerprint } from "@/lib/contract-hash";
import ContractSheet from "@/components/print/ContractSheet";
import PrintButton from "@/components/print/PrintButton";

export const metadata: Metadata = {
  title: "معاينة عقد إلكتروني موقّع نموذجي — منصة ميثاق",
  description:
    "شاهد كيف يبدو عقدك الإلكتروني الموقّع رسمياً عبر منصة ميثاق مع التوقيع المرسوم، شهادة الإتمام ثنائية اللغة (عربي/إنجليزي)، بصمة SHA-256، ورمز QR للتحقق.",
  alternates: { canonical: "/sample" },
};

/* توقيعان خطيان توضيحيان بصيغة SVG Data URL لصفحة المعاينة العامة فقط */
const SAMPLE_SIG1 =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 70"><path d="M18 46 C42 14, 65 58, 92 34 C112 16, 128 52, 152 38 C176 24, 198 44, 222 30" fill="none" stroke="#0b3d2e" stroke-width="3" stroke-linecap="round"/><path d="M40 55 Q120 48 205 56" fill="none" stroke="#b8963e" stroke-width="1.5" stroke-linecap="round"/></svg>`
  );

const SAMPLE_SIG2 =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 70"><path d="M22 38 C46 54, 70 12, 98 42 C120 60, 144 18, 174 36 C192 46, 208 24, 224 38" fill="none" stroke="#0f3d2e" stroke-width="2.8" stroke-linecap="round"/><path d="M55 54 Q135 50 198 54" fill="none" stroke="#1b6b4f" stroke-width="1.4" stroke-linecap="round"/></svg>`
  );

export default function SampleContractPage() {
  const sampleDate = new Date("2026-11-10T10:30:00.000Z");
  const sig1Date = new Date("2026-11-10T10:35:00.000Z");
  const sig2Date = new Date("2026-11-10T11:12:00.000Z");

  const baseInput = {
    id: "00000000-0000-4000-8000-000000000001",
    type: "design",
    party1Name: "استوديو نور للتصميم والبرمجة (سامر الخطيب)",
    party2Name: "شركة الشام للتجارة والخدمات (م. طارق المنصور)",
    amount: "1,200 دولار أمريكي",
    city: "دمشق",
    subject: "تصميم وتطوير متجر إلكتروني متكامل باللغة العربية مع لوحة إدارة وتدريب الفريق",
    duration: "45 يوماً من تاريخ استلام الدفعة الأولى",
    paymentMethod: "50% دفعة أولى عند التوقيع + 50% عند التسليم النهائي",
    notes: "هذا عقد نموذجي توضيحي لإظهار شكل الوثيقة الموقّعة وشهادة التوثيق على منصة ميثاق.",
  };

  const clauses = resolveClauses({
    ...baseInput,
    clauses: [],
    date: sampleDate,
  });

  const sampleHash = contractFingerprint({
    ...baseInput,
    date: sampleDate,
    clauses,
    content: "",
    signingMode: "send",
    party2Email: "client@example.com",
    party2GoogleId: "sample-verified-id",
    status: "signed",
    sig1Name: baseInput.party1Name,
    sig1DataUrl: SAMPLE_SIG1,
    sig1SignedAt: sig1Date,
    sig2Name: baseInput.party2Name,
    sig2DataUrl: SAMPLE_SIG2,
    sig2SignedAt: sig2Date,
  });

  const sampleContract: Contract = {
    id: baseInput.id,
    ownerId: "00000000-0000-4000-8000-000000000000",
    shareToken: "sample-preview",
    type: baseInput.type,
    party1Name: baseInput.party1Name,
    party2Name: baseInput.party2Name,
    amount: baseInput.amount,
    country: "SY",
    city: baseInput.city,
    duration: baseInput.duration,
    paymentMethod: baseInput.paymentMethod,
    subject: baseInput.subject,
    notes: baseInput.notes,
    clauses,
    content: "",
    qrDataUrl: "",
    favorite: false,
    premium: false,
    reviewStatus: "none",
    status: "signed",
    signingMode: "send",
    party2Email: "client@example.com",
    party2GoogleId: "sample-verified-id",
    sig1Name: baseInput.party1Name,
    sig1DataUrl: SAMPLE_SIG1,
    sig1SignedAt: sig1Date,
    sig2Name: baseInput.party2Name,
    sig2DataUrl: SAMPLE_SIG2,
    sig2SignedAt: sig2Date,
    contentHash: sampleHash,
    createdAt: sampleDate,
    updatedAt: sig2Date,
  };

  const base = (process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com")
    .trim()
    .replace(/\/+$/, "");

  return (
    <main style={{ padding: "24px 18px 60px" }}>
      <div
        className="no-print"
        style={{
          maxWidth: 820,
          margin: "0 auto 18px",
          padding: "16px 20px",
          borderRadius: 16,
          background: "linear-gradient(135deg, #0b3d2e, #15533f)",
          color: "#fff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          boxShadow: "0 10px 28px rgba(11, 61, 46, 0.18)",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              fontWeight: 800,
              color: "#e6c978",
              marginBottom: 4,
            }}
          >
            <i className="fas fa-eye" /> معاينة حيّة لنموذج عقد موقّع بالكامل
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
            هكذا يبدو عقدك النهائي الموقّع والموثّق عبر ميثاق
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, opacity: 0.9 }}>
            توقيع مرسوم من الطرفين · شهادة إتمام عربي/إنجليزي · بصمة SHA-256 · رمز QR للتحقق
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Link className="btn btn-primary btn-sm" href="/?type=design">
            <i className="fas fa-file-circle-plus" /> أنشئ عقدك مجاناً الآن
          </Link>
          <PrintButton />
          <Link
            className="btn btn-soft btn-sm"
            href="/"
            style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}
          >
            ← الرئيسية
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <ContractSheet
          contract={sampleContract}
          clauses={clauses}
          verifyUrl={`${base}/sample`}
        />
      </div>

      <div
        className="no-print"
        style={{
          maxWidth: 820,
          margin: "24px auto 0",
          padding: "20px 22px",
          borderRadius: 16,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <strong style={{ color: "var(--green)", fontSize: 15, display: "block" }}>
            جاهز لتوثيق اتفاقك القادم خلال دقيقتين؟
          </strong>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            أول 3 عقود شهرياً مجاناً بالكامل — وباقة المكاتب ($49/شهر) تتيح وضع شعار مكتبك الخاص على كل PDF.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/?type=design">
            <i className="fas fa-wand-magic-sparkles" /> ابدأ عقدك الأول مجاناً
          </Link>
          <Link className="btn btn-soft" href="/pricing">
            الباقات والأسعار
          </Link>
        </div>
      </div>
    </main>
  );
}
