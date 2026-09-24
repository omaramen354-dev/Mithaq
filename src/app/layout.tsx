import type { Metadata } from "next";
import { Cairo, Noto_Naskh_Arabic } from "next/font/google";
import "./mithaq.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-cairo",
});

const naskh = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-naskh",
});

export const metadata: Metadata = {
  title: "ميثاق – MITHAQ | عقودك بثقة وسهولة",
  description:
    "أنشئ عقدك، عدّل البنود، أضف توقيعاً رقمياً، شارك رابطاً عاماً، واطبع PDF — كل ذلك من مكان واحد.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com"
  ),
  openGraph: {
    title: "ميثاق — منصة العقود الذكية العربية",
    description: "أنشئ العقود ووقّعها رقمياً وتحقق منها",
    siteName: "ميثاق",
    locale: "ar_AR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/* Font Awesome — أيقونات الهوية الأسطورية */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
      </head>
      <body className={`${cairo.variable} ${naskh.variable}`}>
        {children}
      </body>
    </html>
  );
}
