import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./mithaq.css";
/* أيقونات Font Awesome محلياً — لا CDN خارجي ولا طلب طرف ثالث */
import "@fortawesome/fontawesome-free/css/all.min.css";
import ThemeInit from "@/components/ThemeInit";
import ThemeToggle from "@/components/ThemeToggle";
import ErrorReporter from "@/components/ErrorReporter";

/* خط ثمانية — Sans للنصوص + Serif Display للعناوين الكبيرة */
const thmanyahSans = localFont({
  src: [
    { path: "./fonts/thmanyah-sans-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/thmanyah-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/thmanyah-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/thmanyah-sans-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/thmanyah-sans-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-thmanyah",
  display: "swap",
});

const thmanyahDisplay = localFont({
  src: [
    { path: "./fonts/thmanyah-display-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/thmanyah-display-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/thmanyah-display-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/thmanyah-display-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-thmanyah-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    (process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com").trim()
  ),
  title: {
    default: "ميثاق – MITHAQ | عقودك بثقة وسهولة",
    template: "%s",
  },
  description:
    "أنشئ عقدك، عدّل البنود، أضف توقيعاً رقمياً، شارك رابطاً عاماً، واطبع PDF — كل ذلك من مكان واحد. نماذج عقود عربية جاهزة: إيجار، بيع، خدمات، عمل حر، شراكة، سرية، وتصميم.",
  applicationName: "ميثاق",
  authors: [{ name: "ميثاق", url: "https://miithaq.com" }],
  creator: "ميثاق",
  publisher: "ميثاق",
  category: "business",
  keywords: [
    "عقود إلكترونية",
    "نماذج عقود بالعربي",
    "عقد إيجار",
    "عقد بيع",
    "عقد خدمات",
    "عقد عمل حر",
    "اتفاقية سرية",
    "توقيع إلكتروني",
    "ميثاق",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "ميثاق — منصة العقود الذكية العربية",
    description:
      "أنشئ العقود ووقّعها رقمياً وتحقق منها — قوالب عربية جاهزة وبصمة SHA-256 ونسخة PDF.",
    siteName: "ميثاق",
    locale: "ar_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ميثاق — منصة العقود الذكية العربية",
    description:
      "أنشئ العقود ووقّعها رقمياً وتحقق منها — قوالب عربية جاهزة وبصمة SHA-256 ونسخة PDF.",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${thmanyahSans.variable} ${thmanyahDisplay.variable}`}>
        {/* يمنع وميض الصفحة الفاتحة عند الاستيقاظ في الوضع الليلي */}
        <ThemeInit />
        <ErrorReporter />
        {children}
        {/* زر تبديل الوضع الليلي — ثابت في كل الصفحات */}
        <ThemeToggle />
      </body>
    </html>
  );
}
