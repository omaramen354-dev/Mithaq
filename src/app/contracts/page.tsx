import type { Metadata } from "next";
import Link from "next/link";
import { CONTRACT_GUIDES } from "@/lib/contract-guides";
import { OG_IMAGE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "دليل نماذج العقود العربية — ميثاق",
  description:
    "تصفّح جميع نماذج العقود العربية الجاهزة في ميثاق: إيجار، بيع، خدمات، عمل حر، شراكة، سرية، وتصميم — مع توقيع رقمي وبصمة SHA-256.",
  alternates: { canonical: "/contracts" },
  openGraph: {
    title: "دليل نماذج العقود العربية — ميثاق",
    description:
      "11 نموذج عقد عربي جاهز للتخصيص والتوقيع الإلكتروني والتحقق الفوري.",
    url: "/contracts",
    siteName: "ميثاق",
    locale: "ar_AR",
    type: "website",
    images: [OG_IMAGE],
  },
};

export default function ContractsIndexPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-back">
          <i className="fas fa-arrow-right" />
          العودة إلى المنصة
        </Link>
        <div className="legal-title-wrap">
          <div className="legal-kicker">أدلة ونماذج ميثاق</div>
          <h1>نماذج العقود العربية الجاهزة</h1>
          <p>اختر نوع العقد للتعرف على بنوده والبدء بإنشائه فوراً خلال دقائق.</p>
        </div>
      </header>

      <div className="legal-body">
        {CONTRACT_GUIDES.map((g) => (
          <section key={g.slug} className="legal-section">
            <h2>
              <Link href={`/contracts/${g.slug}`}>{g.name}</Link>
            </h2>
            <p>{g.summary}</p>
            <p>
              <Link href={`/contracts/${g.slug}`} className="legal-back">
                قراءة الدليل وإنشاء {g.name}
              </Link>
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
