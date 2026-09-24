import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contracts, type Contract } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Logo from "@/components/Logo";
import ContractsTable from "@/components/dashboard/ContractsTable";
import NewContractForm from "@/components/dashboard/NewContractForm";

export const dynamic = "force-dynamic";

/* ============================================================
   الصفحة الرئيسية — لوحة إدارة العقود
   محمية عبر session من Auth.js v5، وجلب العقود مباشرة من Neon
   عبر Drizzle db.select (بنفس منطق GET /api/contracts تماماً)
   ============================================================ */

export default async function Home() {
  /* 1) الحماية: لا لوحة بدون جلسة صالحة */
  const session = await auth();
  if (!session?.user?.dbId) redirect("/login");

  /* 2) جلب عقود المستخدم مباشرة من قاعدة البيانات (نفس استعلام GET /api/contracts) */
  const rows: Contract[] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.ownerId, session.user.dbId))
    .orderBy(desc(contracts.createdAt));

  return (
    <main style={{ padding: 20 }}>
      {/* ترويسة اللوحة */}
      <header
        className="card"
        style={{
          maxWidth: 1020,
          padding: "16px 22px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Logo height={30} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <b style={{ fontSize: 16, fontWeight: 900, display: "block" }}>
            لوحة إدارة العقود
          </b>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            منظومة العقود والتوثيق الإلكتروني — مرحباً{" "}
            {session.user.name || "بك"}
          </small>
        </div>
        <form
          action={async () => {
            "use server";
            const { signOut } = await import("@/lib/auth");
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="btn btn-soft" type="submit">
            تسجيل الخروج
          </button>
        </form>
      </header>

      {/* 3) نموذج الإنشاء + جدول العقود (Client Components مربوطة بالـ APIs) */}
      <div style={{ maxWidth: 1020, margin: "0 auto" }}>
        <NewContractForm />
        <ContractsTable contracts={rows} />
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
        🛡️ كل عقد يحمل بصمة رقمية SHA-256 وتاريخ توقيع موثق — لا يمكن التعديل بعد
        توقيع الطرفين.
      </p>
    </main>
  );
}
