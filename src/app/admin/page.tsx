import { auth, signOut, adminEmails } from "@/lib/auth";
import { db } from "@/db";
import { contracts, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { contractTypeName } from "@/lib/contract-types";
import { arDate } from "@/lib/format";
import RevealOnScroll from "@/components/dashboard/RevealOnScroll";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "لوحة الإدارة — ميثاق",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ============================================================
   /admin — لوحة الإدارة (صفحة مستقلة بهوية ميثاق الكاملة)
   متاحة فقط للمشرفين (isAdmin من الجلسة). غير المشرف يرى شاشة قفل.
   تعرض نبض المنصة الحي: العقود والتوقيعات والمستخدمين والمشتركين.
   ============================================================ */

export default async function AdminPage() {
  const session = await auth();
  const isAdmin = Boolean(session?.user?.isAdmin);

  if (!isAdmin) {
    return (
      <main className="admin-gate">
        <div className="admin-gate-card">
          <div className="admin-gate-icon">
            <i className="fas fa-lock" />
          </div>
          <h1>منطقة محمية</h1>
          <p>هذه اللوحة مخصصة لمشرفي منصة ميثاق فقط.</p>
          {session?.user ? (
            <p className="admin-gate-email">
              حسابك: <bdi>{session.user.email}</bdi>
            </p>
          ) : (
            <a className="btn btn-primary" href="/login">
              <i className="fas fa-right-to-bracket" />
              تسجيل الدخول
            </a>
          )}
          <a className="admin-gate-back" href="/">
            ← العودة إلى المنصة
          </a>
        </div>
      </main>
    );
  }

  /* ===== إحصائيات حية ===== */
  const [
    totalContracts,
    signedContracts,
    partialContracts,
    totalUsers,
    premiumUsers,
    recentContracts,
    typeCounts,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(contracts),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contracts)
      .where(eq(contracts.status, "signed")),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contracts)
      .where(eq(contracts.status, "partially_signed")),
    db.select({ n: sql<number>`count(*)::int` }).from(users),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.plan, "premium")),
    db
      .select()
      .from(contracts)
      .orderBy(desc(contracts.createdAt))
      .limit(8),
    db
      .select({
        type: contracts.type,
        n: sql<number>`count(*)::int`,
      })
      .from(contracts)
      .groupBy(contracts.type)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
  ]);

  const draftContracts = totalContracts[0].n - signedContracts[0].n - partialContracts[0].n;
  const maxType = typeCounts[0]?.n || 1;
  const admins = adminEmails();

  const stats = [
    { icon: "fa-file-contract", label: "إجمالي العقود", value: totalContracts[0].n },
    { icon: "fa-file-signature", label: "موقّعة بالكامل", value: signedContracts[0].n, gold: true },
    { icon: "fa-pen-nib", label: "بانتظار توقيع الثاني", value: partialContracts[0].n },
    { icon: "fa-inbox", label: "مسودات", value: draftContracts },
    { icon: "fa-users", label: "المستخدمون", value: totalUsers[0].n },
    { icon: "fa-crown", label: "مشتركون Premium", value: premiumUsers[0].n, gold: true },
  ];

  return (
    <main className="admin-page">
      <RevealOnScroll />

      {/* رأس اللوحة */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-identity">
            <span className="mithaq-logo-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mithaq-logo-v2.svg" alt="شعار ميثاق" width={48} height={48} />
            </span>
            <div>
              <div className="admin-kicker">منصة ميثاق — الإدارة</div>
              <h1 className="admin-title">نبض المنصة، لحظة بلحظة</h1>
            </div>
          </div>
          <div className="admin-header-actions">
            <a className="btn btn-outline" href="/">
              <i className="fas fa-house" />
              المنصة
            </a>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="btn btn-primary" type="submit">
                <i className="fas fa-right-from-bracket" />
                خروج
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* بطاقات الإحصائيات */}
      <section className="admin-stats reveal">
        {stats.map((s) => (
          <div className={`admin-stat${s.gold ? " gold" : ""}`} key={s.label}>
            <div className="admin-stat-icon">
              <i className={`fas ${s.icon}`} />
            </div>
            <div>
              <div className="admin-stat-value">{s.value}</div>
              <div className="admin-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </section>

      <div className="admin-grid">
        {/* أحدث العقود */}
        <section className="admin-panel reveal">
          <div className="admin-panel-head">
            <i className="fas fa-clock-rotate-left" />
            <h2>أحدث العقود</h2>
          </div>
          {recentContracts.length === 0 ? (
            <div className="admin-empty">لا توجد عقود بعد — أول عقد سيظهر هنا فوراً.</div>
          ) : (
            <ul className="admin-list">
              {recentContracts.map((c) => (
                <li key={c.id} className="admin-row">
                  <div className="admin-row-main">
                    <span className="admin-row-title">
                      عقد {contractTypeName(c.type)}
                    </span>
                    <span className="admin-row-parties">
                      {c.party1Name} ↔ {c.party2Name}
                    </span>
                  </div>
                  <div className="admin-row-side">
                    <span
                      className={`admin-badge ${
                        c.status === "signed"
                          ? "b-signed"
                          : c.status === "partially_signed"
                            ? "b-partial"
                            : "b-draft"
                      }`}
                    >
                      {c.status === "signed"
                        ? "موقّع ✓"
                        : c.status === "partially_signed"
                          ? "نصف موقّع"
                          : "مسودة"}
                    </span>
                    <span className="admin-row-date">{arDate(c.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* الجانب: أنواع العقود + المشرفون */}
        <div className="admin-side">
          <section className="admin-panel reveal">
            <div className="admin-panel-head">
              <i className="fas fa-chart-simple" />
              <h2>أكثر القوالب استخداماً</h2>
            </div>
            {typeCounts.length === 0 ? (
              <div className="admin-empty">لا توجد بيانات بعد.</div>
            ) : (
              <ul className="admin-bars">
                {typeCounts.map((t) => (
                  <li key={t.type}>
                    <div className="admin-bar-top">
                      <span>{contractTypeName(t.type)}</span>
                      <b>{t.n}</b>
                    </div>
                    <div className="admin-bar-track">
                      <div
                        className="admin-bar-fill"
                        style={{ width: `${Math.round((t.n / maxType) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-panel reveal">
            <div className="admin-panel-head">
              <i className="fas fa-user-shield" />
              <h2>المشرفون</h2>
            </div>
            <ul className="admin-admins">
              {admins.length ? (
                admins.map((e) => (
                  <li key={e}>
                    <i className="fas fa-shield-halved" />
                    <bdi>{e}</bdi>
                  </li>
                ))
              ) : (
                <li>
                  <i className="fas fa-circle-info" />
                  حدّد ADMIN_EMAILS في متغيرات البيئة
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      <footer className="admin-footer">
        <span className="gold">مِــيــثَــاق</span> — لوحة الإدارة · البيانات مباشرة من Neon
      </footer>
    </main>
  );
}
