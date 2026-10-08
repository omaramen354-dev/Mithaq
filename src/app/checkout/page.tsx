import { auth } from "@/lib/auth";
import CheckoutClient from "./CheckoutClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "إنهاء الدفع — ميثاق",
  description: "أكمل عملية الشراء عبر شام كاش وفعّل باقتك فوراً.",
};

export const dynamic = "force-dynamic";

/* ============================================================
   /checkout — صفحة إنهاء الدفع (Server Component)
   تقرأ الباقة المختارة من ?plan=<id> وتمرّرها للعميل مع حالة
   تسجيل الدخول. صفحة قابلة للعمل للضيوف (يُوجَّهون للدخول).
   ============================================================ */

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planParam } = await searchParams;
  const session = await auth();

  return (
    <CheckoutClient
      planParam={planParam || ""}
      isLoggedIn={Boolean(session?.user?.dbId)}
      userName={session?.user?.name || null}
    />
  );
}
