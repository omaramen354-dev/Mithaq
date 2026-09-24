import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, type Contract } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { signOut } from "@/lib/auth";
import MithaqSidebar from "@/components/dashboard/MithaqSidebar";
import MithaqHero from "@/components/dashboard/MithaqHero";
import {
  StatsBar,
  ContractTypes,
  Features,
  MithaqFooter,
} from "@/components/dashboard/MithaqSections";
import ContractsTable from "@/components/dashboard/ContractsTable";
import NewContractForm from "@/components/dashboard/NewContractForm";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";

export const dynamic = "force-dynamic";

/* ============================================================
   منصة ميثاق — الواجهة الأسطورية الأصلية (v1)
   سايدبار زمردي + هيرو بنقشة السداسيات + بطاقة 3D + إحصائيات
   + قوالب العقود الذهبية + المميزات — أي زائر يفتح المنصة
   مباشرة وينشئ عقداً كاملاً. الدخول اختياري ويطلب عند الحفظ.
   ============================================================ */

export default async function Home() {
  const session = await auth();
  const dbId = session?.user?.dbId;
  const isUser = Boolean(dbId);

  const rows: Contract[] = isUser
    ? await db
        .select()
        .from(contracts)
        .where(eq(contracts.ownerId, dbId!))
        .orderBy(desc(contracts.createdAt))
    : [];

  return (
    <>
      <MithaqSidebar
        mode={isUser ? "user" : "guest"}
        userName={session?.user?.name}
        userPicture={session?.user?.picture}
        contractsCount={rows.length}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />

      <div className="main-wrapper">
        <DashboardTopbar />

        <MithaqHero
          onCreateClick={() => {
            document
              .getElementById("create")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
          onTypesClick={() => {
            document
              .getElementById("types")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <StatsBar contracts={rows.length} />

        {/* قسم إنشاء العقد — نموذج ميثاق الحي داخل التصميم الأسطوري */}
        <section className="section form-section" id="create">
          <div className="section-header">
            <div>
              <div className="section-label">إنشاء عقد</div>
              <h2 className="section-title">وثيقتك الجديدة</h2>
              <p className="section-sub">
                املأ البيانات واختر البنود — سيتولد نص العقد أمامك فوراً ببصمة
                SHA-256.
              </p>
            </div>
          </div>
          <NewContractForm mode={isUser ? "user" : "guest"} />
        </section>

        <ContractTypes />

        <Features />

        {/* عقود المستخدم المسجل — جدول العقود بالتصميم الأصلي */}
        {isUser && (
          <section className="section recent-section" id="contracts">
            <div className="recent-header">
              <div>
                <div className="section-label">عقودي</div>
                <h2 className="section-title">آخر العقود المنشأة</h2>
              </div>
            </div>
            <ContractsTable contracts={rows} />
          </section>
        )}

        <MithaqFooter />
      </div>
    </>
  );
}
