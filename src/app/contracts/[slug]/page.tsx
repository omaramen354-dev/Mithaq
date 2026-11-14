import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTRACT_GUIDES, findContractGuide } from "@/lib/contract-guides";
import { DEFAULT_CLAUSES } from "@/lib/clauses";
import { OG_IMAGE } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return CONTRACT_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = findContractGuide(slug);
  if (!guide) {
    return { title: "نموذج عقد غير موجود — ميثاق" };
  }
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/contracts/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `/contracts/${guide.slug}`,
      siteName: "ميثاق",
      locale: "ar_AR",
      type: "article",
      images: [OG_IMAGE],
    },
  };
}

export default async function ContractGuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = findContractGuide(slug);
  if (!guide) notFound();

  const sampleClauses = Object.hasOwn(DEFAULT_CLAUSES, guide.type)
    ? DEFAULT_CLAUSES[guide.type]
    : [];

  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link href="/contracts" className="legal-back">
          <i className="fas fa-arrow-right" />
          كل نماذج العقود
        </Link>
        <div className="legal-title-wrap">
          <div className="legal-kicker">دليل ميثاق للعقود</div>
          <h1>{guide.name}</h1>
          <p>{guide.summary}</p>
        </div>
      </header>

      <div className="legal-body">
        <section className="legal-section">
          <h2>أهم ما يغطيه {guide.name}</h2>
          {guide.keyPoints.map((pt, i) => (
            <p key={i}>• {pt}</p>
          ))}
        </section>

        {sampleClauses.length > 0 && (
          <section className="legal-section">
            <h2>البنود الافتراضية الجاهزة للتعديل</h2>
            {sampleClauses.map((clause, i) => (
              <p key={i}>
                {i + 1}. {clause}
              </p>
            ))}
          </section>
        )}

        <div className="legal-contact">
          <i className="fas fa-file-signature" />
          <span>
            جاهز لتوثيق عقدك؟{" "}
            <Link href="/" style={{ fontWeight: 700, textDecoration: "underline" }}>
              ابدأ إنشاء {guide.name} الآن مجاناً
            </Link>
          </span>
        </div>
      </div>
    </main>
  );
}
