import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { contracts, signatureEvents, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { contractTypeName } from "@/lib/contract-types";
import { arDate, arDateTime } from "@/lib/format";
import { contractVerification } from "@/lib/fingerprint";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminContractPreviewPage({ params }: Props) {
  const session = await auth();
  const isAdmin = session?.user?.dbId
    ? await isAdminUser(session.user.dbId)
    : false;

  if (!isAdmin) {
    return (
      <main className="admin-gate">
        <div className="admin-gate-card">
          <h1>منطقة محجوزة للمشرفين</h1>
          <p>لا تملك صلاحية استعراض تفاصيل هذا العقد.</p>
          <Link href="/" className="admin-btn-primary">
            العودة إلى الرئيسية
          </Link>
        </div>
      </main>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1);

  if (!contract) notFound();

  const [owner, events] = await Promise.all([
    contract.ownerId
      ? db
          .select({ id: users.id, name: users.name, email: users.email, plan: users.plan })
          .from(users)
          .where(eq(users.id, contract.ownerId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db
      .select()
      .from(signatureEvents)
      .where(eq(signatureEvents.contractId, contract.id))
      .orderBy(asc(signatureEvents.signedAt)),
  ]);

  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link href="/admin" className="legal-back">
          <i className="fas fa-arrow-right" />
          العودة إلى لوحة المشرف
        </Link>
        <div className="legal-title-wrap">
          <div className="legal-kicker">
            معاينة المشرف · {contractVerification(contract.id, contract.updatedAt, contract.status).ref}
          </div>
          <h1>عقد {contractTypeName(contract.type)}</h1>
          <p>
            {contract.party1Name} ↔ {contract.party2Name} · أُنشئ في {arDate(contract.createdAt)}
          </p>
        </div>
      </header>

      <div className="legal-body">
        <section className="legal-section">
          <h2>بيانات العقد</h2>
          <p>الحالة: {contract.status}</p>
          <p>وضع التوقيع: {contract.signingMode}</p>
          <p>المبلغ: {contract.amount || "—"}</p>
          <p>البصمة (SHA-256): <bdi dir="ltr">{contract.contentHash || "—"}</bdi></p>
          {owner && (
            <p>
              المالك: {owner.name} (<bdi dir="ltr">{owner.email}</bdi>) · الباقة: {owner.plan}
            </p>
          )}
        </section>

        <section className="legal-section">
          <h2>نص العقد</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.9 }}>
            {contract.content}
          </pre>
        </section>

        <section className="legal-section">
          <h2>سجل التوقيعات ({events.length})</h2>
          {events.length === 0 ? (
            <p>لا توجد توقيعات مسجّلة حتى الآن.</p>
          ) : (
            events.map((ev) => (
              <p key={ev.id}>
                • {ev.party === "party1" ? "الطرف الأول" : "الطرف الثاني"}: {ev.signerName}{" "}
                {ev.signerEmail ? `(${ev.signerEmail})` : ""} — {arDateTime(ev.signedAt)} — IP:{" "}
                <bdi dir="ltr">{ev.ipAddress}</bdi>
              </p>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
