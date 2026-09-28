import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import PricingClient from "./PricingClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "الأسعار والباقات — ميثاق",
  description:
    "باقات ميثاق: العقد الواحد، أساسي، موثّق، المستقل، المكاتب، والمراجعة القانونية — ادفع بـ USDT أو شام كاش.",
};

export const dynamic = "force-dynamic";

/* ============================================================
   /pricing — صفحة الأسعار (Server Component)
   عامة للضيوف والمسجلين (Guest-First): الضيف يرى الباقات
   ويُوجَّه للدخول عند الاشتراك. للمسجل: تُجلب طلباته الأخيرة
   من payment_requests لعرض حالتها مباشرة.
   ============================================================ */

export default async function PricingPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.dbId);

  let myRequests: { id: string; plan: string; status: string; createdAt: string }[] = [];
  if (isLoggedIn) {
    const rows = await db
      .select({
        id: paymentRequests.id,
        plan: paymentRequests.plan,
        status: paymentRequests.status,
        createdAt: paymentRequests.createdAt,
      })
      .from(paymentRequests)
      .where(eq(paymentRequests.userId, session!.user!.dbId!))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(6);
    myRequests = rows.map((r) => ({
      id: r.id,
      plan: r.plan,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return (
    <PricingClient
      isLoggedIn={isLoggedIn}
      userName={session?.user?.name || null}
      myRequests={myRequests}
    />
  );
}
