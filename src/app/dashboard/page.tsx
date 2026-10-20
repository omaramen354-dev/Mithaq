import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { db } from "@/db";
import { contracts, users, type Contract } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import MithaqSidebar from "@/components/dashboard/MithaqSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import ContractModal from "@/components/dashboard/ContractModal";
import ContractsTable from "@/components/dashboard/ContractsTable";
import AccountOverview from "@/components/dashboard/AccountOverview";
import RevealOnScroll from "@/components/dashboard/RevealOnScroll";
import NewContractButton from "@/components/dashboard/NewContractButton";
import { MithaqFooter } from "@/components/dashboard/MithaqSections";

export const dynamic = "force-dynamic";

/* ============================================================
   /dashboard — لوحة حساب العميل المستقلة
   صفحة خاصة بالمسجّلين فقط: نظرة عامة على الاشتراك،
   الإحصائيات، وآخر العقود — منفصلة تماماً عن الصفحة الرئيسية.
   ============================================================ */

export default async function DashboardPage() {
  const session = await auth();
  const dbId = session?.user?.dbId;
  if (!dbId) redirect("/login?callbackUrl=/dashboard");

  const rows: Contract[] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.ownerId, dbId))
    .orderBy(desc(contracts.createdAt));

  const meRows = await db
    .select({
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, dbId))
    .limit(1);
  const me = meRows[0];

  const signedCount = rows.filter((c) => c.status === "signed").length;

  return (
    <>
      <RevealOnScroll />
      <MithaqSidebar
        mode="user"
        userName={session?.user?.name}
        userPicture={session?.user?.picture}
        contractsCount={rows.length}
        plan={me?.plan}
        planExpiresAt={me?.planExpiresAt?.toISOString() || null}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />

      <div className="main-wrapper">
        <DashboardTopbar isAdmin={Boolean(session?.user?.isAdmin)} userName={session?.user?.name} />

        <main className="dash-page">
          {/* ترويسة الصفحة */}
          <div className="dash-hero reveal">
            <div>
              <span className="dash-eyebrow">
                <i className="fas fa-gauge-high" /> لوحة التحكم
              </span>
              <h1>
                مرحباً، {(session?.user?.name || "صديقنا").trim().split(" ")[0]}
              </h1>
              <p>
                إدارة عقودك واشتراكك في مكان واحد — {rows.length} عقد
                {signedCount > 0 ? ` منها ${signedCount} موقّع بالكامل` : ""}.
              </p>
            </div>
            <div className="dash-hero-actions">
              <NewContractButton />
              <Link className="btn btn-soft" href="/">
                <i className="fas fa-house" /> الرئيسية
              </Link>
            </div>
          </div>

          <AccountOverview
            userName={session?.user?.name || "صديقنا"}
            plan={me?.plan || "free"}
            planExpiresAt={me?.planExpiresAt?.toISOString() || null}
            contracts={rows}
            memberSince={me?.createdAt?.toISOString() || null}
          />

          <section className="section dash-contracts reveal" id="contracts">
            <div className="section-header">
              <div>
                <div className="section-label">أرشيف العقود</div>
                <h2 className="section-title">كل عقودي</h2>
                <p className="section-sub">
                  افتح أي عقد للتوقيع أو المشاركة أو الطباعة أو التحقق من البصمة.
                </p>
              </div>
              <Link className="btn btn-soft btn-sm" href="/#create">
                <i className="fas fa-plus" /> إنشاء عقد
              </Link>
            </div>
            <ContractsTable contracts={rows} />
          </section>

          <MithaqFooter />
        </main>
      </div>

      <ContractModal mode="user" />
    </>
  );
}
