import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveClauses } from "@/lib/contract-text";
import { contractTypeName } from "@/lib/contract-types";
import { shareUrlFor } from "@/lib/fingerprint";
import ContractSheet from "@/components/print/ContractSheet";
import OwnerSignFlow from "@/components/signing/OwnerSignFlow";
import PrintButton from "@/components/print/PrintButton";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

/* ============================================================
   /sign/[id] — صفحة التوقيع الخاصة بصاحب العقد
   تُفتح فوراً بعد حفظ العقد (بلا نزول للأسفل) بنفس فلو النسخة
   القديمة openSigningView: توقيع الطرف الأول ← زر «مشاركة
   للتوقيع» ← العقد النهائي. الوثيقة A4 بنفس تنسيق /print.
   محمية بجلسة صاحب العقد فقط.
   ============================================================ */

type Props = { params: Promise<{ id: string }> };

export default async function SignPage({ params }: Props) {
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

  const shareUrl = shareUrlFor(contract.shareToken);

  return (
    <main style={{ padding: 20 }}>
      {/* ===== شريط الأدوات (يختفي عند الطباعة) ===== */}
      <div
        className="no-print"
        style={{
          maxWidth: 860,
          margin: "0 auto 14px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            padding: "7px 10px",
            borderRadius: 12,
            background: "linear-gradient(135deg, #071f1a, #1d4a3e)",
            boxShadow: "0 2px 10px rgba(7,31,26,0.25)",
          }}
        >
          <Logo height={26} />
        </span>
        <b style={{ fontSize: 14.5, color: "var(--green)" }}>
          صفحة توقيع — {contractTypeName(contract.type)}
        </b>
        <span style={{ flex: 1 }} />
        <PrintButton />
        <a className="btn btn-soft" href="/#contracts">
          ← رجوع للعقود
        </a>
      </div>

      {/* ===== فلو المراحل: توقيع ← مشاركة ← العقد النهائي ===== */}
      <OwnerSignFlow
        contract={{
          id: contract.id,
          type: contract.type,
          party1Name: contract.party1Name,
          party2Name: contract.party2Name,
          status: contract.status,
          updatedAt: contract.updatedAt,
        }}
        shareToken={contract.shareToken}
        shareUrl={shareUrl}
        party1Name={contract.party1Name}
        party2Name={contract.party2Name}
        sig1={Boolean(contract.sig1SignedAt)}
        sig2={Boolean(contract.sig2SignedAt)}
      />

      {/* ===== وثيقة العقد A4 (نفس تنسيق الطباعة) ===== */}
      <div id="mithaq-sheet" style={{ maxWidth: 860, margin: "0 auto" }}>
        <ContractSheet contract={contract} clauses={clauses} />
      </div>
    </main>
  );
}
