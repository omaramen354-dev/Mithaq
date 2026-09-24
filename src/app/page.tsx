import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, type Contract } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { signOut } from "@/lib/auth";
import ContractsTable from "@/components/dashboard/ContractsTable";
import NewContractForm from "@/components/dashboard/NewContractForm";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

/* ============================================================
   الصفحة الرئيسية — لوحة إدارة العقود (Guest-First)
   - للضيف: اللوحة تفتح مباشرة دون تسجيل — تجربة كاملة لنموذج
     الإنشاء والبنود والمعاينة الديناميكية، والحفظ/الطباعة
     يفتحان نافذة تسجيل دخول مع حفظ المسودة محلياً (LocalStorage)
     واستعادتها تلقائياً بعد الدخول.
   - للمسجل: جلب العقود مباشرة من Neon عبر Drizzle db.select
     (بنفس منطق GET /api/contracts تماماً).
   - المسار عام في middleware — الحماية الحقيقية على عمليات
     الكتابة داخل الـ APIs (401 لغير المسجلين).
   ============================================================ */

export default async function Home() {
  /* 1) من هو الزائر؟ (بدون أي redirect — الرئيسية عامة) */
  const session = await auth();
  const dbId = session?.user?.dbId;
  const isUser = Boolean(dbId);

  /* 2) عقود المسجل من Neon — الضيف يرى لوحة فارغة للتجربة */
  const rows: Contract[] = isUser
    ? await db
        .select()
        .from(contracts)
        .where(eq(contracts.ownerId, dbId!))
        .orderBy(desc(contracts.createdAt))
    : [];

  return (
    <main style={{ padding: 20 }}>
      {/* ترويسة اللوحة + شريط الضيف الترحيبي */}
      <DashboardClient
        mode={isUser ? "user" : "guest"}
        userName={session?.user?.name}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />

      {/* نموذج الإنشاء + جدول العقود (Client Components مربوطة بالـ APIs) */}
      <div style={{ maxWidth: 1020, margin: "0 auto" }}>
        <NewContractForm mode={isUser ? "user" : "guest"} />
        {isUser && <ContractsTable contracts={rows} />}
      </div>

      <p
        style={{
          maxWidth: 1020,
          margin: "10px auto 24px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 11,
        }}
      >
        🛡️ كل عقد يحمل بصمة رقمية SHA-256 وتاريخ توقيع موثق — لا يمكن التعديل
        بعد توقيع الطرفين.
      </p>
    </main>
  );
}
