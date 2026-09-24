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
   منصة ميثاق — الصفحة الرئيسية (الهوية الأسطورية)
   أي زائر يفتح المنصة مباشرة وينشئ عقداً كاملاً بنفس واجهة
   النسخة الأصلية الزمردية الذهبية. عند الحفظ/الطباعة فقط
   يطلب دخولاً سريعاً عبر Google مع استعادة بياناته تلقائياً.
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
    <main style={{ padding: 20 }}>
      <DashboardClient
        mode={isUser ? "user" : "guest"}
        userName={session?.user?.name}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />

      <div style={{ maxWidth: 1020, margin: "0 auto" }}>
        <NewContractForm mode={isUser ? "user" : "guest"} />
        {isUser && <ContractsTable contracts={rows} />}
      </div>

      <div style={{ maxWidth: 1020, margin: "0 auto" }}>
        <hr className="gold-rule" />
        <p
          style={{
            textAlign: "center",
            color: "var(--muted)",
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          🛡️ كل عقد يحمل بصمة رقمية SHA-256 وتاريخ توقيع موثق — لا يمكن التعديل
          بعد توقيع الطرفين.
        </p>
      </div>
    </main>
  );
}
