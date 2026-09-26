import type { Metadata } from "next";
import localFont from "next/font/local";
import "./mithaq.css";

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
      <body className={`${thmanyahSans.variable} ${thmanyahDisplay.variable}`}>
        {children}
      </body>
    </html>
  );
}
