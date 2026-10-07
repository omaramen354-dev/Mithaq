import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveClauses } from "@/lib/contract-text";
import PrintButton from "@/components/print/PrintButton";
import ContractSheet from "@/components/print/ContractSheet";

export const dynamic = "force-dynamic";

/* ============================================================
   /print/[id] — نسخة A4 مخصصة للطباعة/حفظ PDF
   الوثيقة نفسها عبر ContractSheet الموحّد (ترويسة زمردية +
   شعار شفاف + مرجع توثيق + رمز QR لصفحة التحقق).
   محمية بتسجيل الدخول (المالك فقط) وتُولَّد لحظياً من Neon.
   ============================================================ */

type Props = { params: Promise<{ id: string }> };

export default async function PrintPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.dbId) redirect("/login");

  const { id } = await params;

  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, id), eq(contracts.ownerId, session.user.dbId)))
    .limit(1);
  const contract = rows[0];
  if (!contract) notFound();

  const clauses = resolveClauses({
    type: contract.type,
    party1Name: contract.party1Name,
    party2Name: contract.party2Name,
    amount: contract.amount,
    city: contract.city,
    subject: contract.subject,
    duration: contract.duration,
    paymentMethod: contract.paymentMethod,
    clauses: contract.clauses,
    date: contract.createdAt,
  });

  return (
    <main style={{ padding: 20 }}>
      <div
        className="no-print"
        style={{
          maxWidth: 800,
          margin: "0 auto 14px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <PrintButton />
        <a className="btn btn-soft" href="/#contracts">
          ← رجوع للعقود
        </a>
        <small style={{ color: "var(--muted)" }}>
          اختر «حفظ كـ PDF» من حوار الطباعة للحصول على نسخة رقمية
        </small>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <ContractSheet contract={contract} clauses={clauses} />
      </div>
    </main>
  );
}
