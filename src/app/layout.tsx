import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "ميثاق — منصة العقود الذكية العربية",
  description: "أنشئ العقود ووقّعها رقمياً وتحقق منها — منصة ميثاق",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com"),
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
      <body className={cairo.className}>{children}</body>
    </html>
  );
}
