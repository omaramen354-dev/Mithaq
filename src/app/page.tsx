import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, users, type Contract } from "@/db/schema";
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
import ContractModal from "@/components/dashboard/ContractModal";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import RevealOnScroll from "@/components/dashboard/RevealOnScroll";
import WelcomeBack from "@/components/dashboard/WelcomeBack";

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

  /* بيانات الحساب للترحيب وبطاقة الباقة */
  const meRows = isUser
    ? await db
        .select({
          plan: users.plan,
          planExpiresAt: users.planExpiresAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, dbId!))
        .limit(1)
    : [];
  const me = meRows[0];
  const signedCount = rows.filter((c) => c.status === "signed").length;
  /* جديد = حسابه عمره أقل من 24 ساعة أو لم ينشئ أي عقد بعد */
  const isNewUser =
    !!me &&
    (Date.now() - me.createdAt.getTime() < 864e5 || rows.length === 0);

  return (
    <>
      <RevealOnScroll />
      <MithaqSidebar
        mode={isUser ? "user" : "guest"}
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
        <DashboardTopbar
          isAdmin={Boolean(session?.user?.isAdmin)}
          userName={isUser ? session?.user?.name : null}
        />

        <MithaqHero
          mode={isUser ? "user" : "guest"}
          userName={session?.user?.name}
          contractsCount={rows.length}
          signedCount={signedCount}
        />

        {isUser && (
          <WelcomeBack
            name={session?.user?.name || "صديقنا"}
            picture={session?.user?.picture}
            isNew={isNewUser}
            contractsCount={rows.length}
            signedCount={signedCount}
            plan={me?.plan || "free"}
          />
        )}

        <StatsBar contracts={rows.length} />

        {/* قسم إنشاء العقد — ترويسة القسم + نافذة إنشاء العقد المنبثقة
            (المودال نفسه يُفتح من الأزرار أو من اختيار نوع عقد، ويعالج
            استعادة مسودة الضيف مرة واحدة — لا يوجد نموذج مضمّن هنا) */}
        <section className="section form-section reveal" id="create">
          <div className="section-header">
            <div>
              <div className="section-label">إنشاء عقد</div>
              <h2 className="section-title">وثيقتك الجديدة</h2>
              <p className="section-sub">
                اضغط «إنشاء عقد جديد» في الأعلى أو اختر قالباً — ستُفتح لك نافذة
                الإنشاء ويتولد نص العقد أمامك فوراً ببصمة SHA-256.
              </p>
            </div>
          </div>
        </section>

        {/* نافذة إنشاء العقد المنبثقة — تُفتح من الأزرار (mithaq:open-contract-modal)
            أو من اختيار نوع العقد (mithaq:pick-type)، وتعالج استعادة مسودة الضيف */}
        <ContractModal mode={isUser ? "user" : "guest"} />

        <ContractTypes />

        <Features />

        {/* عقود المستخدم المسجل — جدول العقود بالتصميم الأصلي */}
        {isUser && (
          <section className="section recent-section reveal" id="contracts">
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
