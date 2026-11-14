import Link from "next/link";
import { auth, signOut, adminEmails } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin-guard";
import { db } from "@/db";
import { contracts, paymentRequests, transactions, users } from "@/db/schema";
import { desc, eq, gte, ne, sql } from "drizzle-orm";
import { contractTypeName } from "@/lib/contract-types";
import { findPlan } from "@/lib/plans";
import { telegramConfigured } from "@/lib/telegram";
import RevealOnScroll from "@/components/dashboard/RevealOnScroll";
import TransactionsManager from "./TransactionsManager";
import PaymentsManager from "./PaymentsManager";
import UsersManager from "./UsersManager";
import ContractsManager from "./ContractsManager";
import LogsManager from "./LogsManager";
import ErrorsManager from "./ErrorsManager";
import TelegramTestButton from "./TelegramTestButton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "لوحة الإدارة — ميثاق",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ============================================================
   /admin — مركز قيادة منصة ميثاق (صفحة مستقلة بهوية ميثاق الكاملة)
   - شريط جاهزية الإطلاق (فحص متغيرات شام كاش / USDT / تيليجرام / واتساب / الكرون)
   - 6 بطاقات KPI تنفيذية (العقود، الإيرادات الموثقة، قيد المراجعة، المستخدمون، المشتركون، نسبة التوقيع)
   - مخطط نبض النمو لآخر 14 يوماً (عقود + تسجيلات جديدة يومياً)
   - إدارة المستخدمين المطوّرة + معاملات شام كاش + طلبات USDT + مستكشف كل العقود + السجل + الأخطاء
   ============================================================ */

function computeReadiness() {
  const shamAcc = (process.env.NEXT_PUBLIC_SHAM_CASH_ACCOUNT || "").trim();
  const shamName = (process.env.NEXT_PUBLIC_SHAM_CASH_NAME || "").trim();
  const usdt = (process.env.NEXT_PUBLIC_USDT_TRC20_ADDRESS || "").trim();
  const wa = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").trim();
  const cron = (process.env.CRON_SECRET || "").trim();

  const items = [
    {
      id: "shamcash",
      label: "شام كاش",
      ok: /^\d{6,}$/.test(shamAcc) && shamName.length >= 2,
      hint: "NEXT_PUBLIC_SHAM_CASH_ACCOUNT + NAME",
      icon: "fa-money-bill-transfer",
    },
    {
      id: "usdt",
      label: "محفظة USDT",
      ok: /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(usdt),
      hint: "NEXT_PUBLIC_USDT_TRC20_ADDRESS",
      icon: "fa-coins",
    },
    {
      id: "whatsapp",
      label: "واتساب الدعم",
      ok: /^\d{8,15}$/.test(wa),
      hint: "NEXT_PUBLIC_SUPPORT_WHATSAPP",
      icon: "fab fa-whatsapp",
    },
    {
      id: "telegram",
      label: "بوت تيليجرام",
      ok: telegramConfigured(),
      hint: "TELEGRAM_BOT_TOKEN + CHAT_ID",
      icon: "fab fa-telegram",
    },
    {
      id: "cron",
      label: "الكرون التلقائي",
      ok: cron.length >= 16,
      hint: "CRON_SECRET",
      icon: "fa-clock",
    },
    {
      id: "db",
      label: "قاعدة البيانات",
      ok: true,
      hint: "Neon Postgres متصل",
      icon: "fa-database",
    },
  ];
  const readyCount = items.filter((i) => i.ok).length;
  return { items, readyCount, total: items.length };
}

export default async function AdminPage() {
  const session = await auth();
  /* الصلاحية من قاعدة البيانات لا من JWT — إزالة الصلاحية تسري فوراً */
  const isAdmin = session?.user?.dbId
    ? await isAdminUser(session.user.dbId)
    : false;

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
            <Link className="btn btn-primary" href="/login">
              <i className="fas fa-right-to-bracket" />
              تسجيل الدخول
            </Link>
          )}
          <Link className="admin-gate-back" href="/">
            ← العودة إلى المنصة
          </Link>
        </div>
      </main>
    );
  }

  const fourteenDaysAgo = new Date(Date.now() - 13 * 864e5);
  fourteenDaysAgo.setUTCHours(0, 0, 0, 0);

  /* ===== إحصائيات حية متوازية ===== */
  const [
    totalContracts,
    signedContracts,
    partialContracts,
    totalUsers,
    premiumUsers,
    verifiedTxs,
    unverifiedTxCount,
    typeCounts,
    payReqs,
    recentContractDates,
    recentUserDates,
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
      .where(ne(users.plan, "free")),
    db
      .select({ planName: transactions.planName })
      .from(transactions)
      .where(eq(transactions.status, "verified")),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.status, "unverified")),
    db
      .select({
        type: contracts.type,
        n: sql<number>`count(*)::int`,
      })
      .from(contracts)
      .groupBy(contracts.type)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
    db
      .select()
      .from(paymentRequests)
      .orderBy(desc(paymentRequests.createdAt))
      .limit(30),
    db
      .select({ createdAt: contracts.createdAt })
      .from(contracts)
      .where(gte(contracts.createdAt, fourteenDaysAgo)),
    db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(gte(users.createdAt, fourteenDaysAgo)),
  ]);

  /* ===== الإيرادات الموثّقة (شام كاش موثّق + USDT مدفوع دون تكرار) ===== */
  const shamRevenueUsd = verifiedTxs.reduce((acc, t) => {
    const p = findPlan(t.planName) || findPlan(t.planName.toLowerCase());
    return acc + (p?.priceUsd || 0);
  }, 0);
  const usdtRevenueUsd = payReqs
    .filter((r) => r.status === "paid" && r.method === "usdt")
    .reduce((acc, r) => acc + (Number(r.amountUsd) || 0), 0);
  const totalRevenueUsd = shamRevenueUsd + usdtRevenueUsd;

  const pendingPayReqs = payReqs.filter(
    (r) => r.status === "pending" || r.status === "manual_review"
  ).length;
  const totalPendingAudit = (unverifiedTxCount[0]?.n || 0) + pendingPayReqs;

  const totalC = totalContracts[0]?.n || 0;
  const signedC = signedContracts[0]?.n || 0;
  const partialC = partialContracts[0]?.n || 0;
  const totalU = totalUsers[0]?.n || 0;
  const paidU = premiumUsers[0]?.n || 0;

  const signRate = totalC > 0 ? Math.round((signedC / totalC) * 100) : 0;
  const convRate = totalU > 0 ? Math.round((paidU / totalU) * 100) : 0;
  const maxType = typeCounts[0]?.n || 1;
  const admins = adminEmails();
  const readiness = computeReadiness();
  const missingPayments = readiness.items.filter(
    (i) => (i.id === "shamcash" || i.id === "usdt") && !i.ok
  );

  /* ===== بيانات نبض النمو اليومي لآخر 14 يوماً ===== */
  const dayBuckets: { key: string; label: string; contracts: number; users: number }[] = [];
  const bucketMap = new Map<string, { contracts: number; users: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    const entry = { contracts: 0, users: 0 };
    bucketMap.set(key, entry);
    dayBuckets.push({ key, label, contracts: 0, users: 0 });
  }
  for (const r of recentContractDates) {
    const k = r.createdAt.toISOString().slice(0, 10);
    const b = bucketMap.get(k);
    if (b) b.contracts++;
  }
  for (const r of recentUserDates) {
    const k = r.createdAt.toISOString().slice(0, 10);
    const b = bucketMap.get(k);
    if (b) b.users++;
  }
  for (const d of dayBuckets) {
    const b = bucketMap.get(d.key);
    if (b) {
      d.contracts = b.contracts;
      d.users = b.users;
    }
  }
  const maxDaily = Math.max(
    1,
    ...dayBuckets.map((d) => Math.max(d.contracts, d.users))
  );

  const stats = [
    {
      icon: "fa-file-contract",
      label: "إجمالي العقود",
      value: totalC,
      sub: `${partialC} بانتظار الثاني`,
    },
    {
      icon: "fa-file-signature",
      label: "موقّعة بالكامل",
      value: signedC,
      sub: `نسبة إتمام ${signRate}%`,
      gold: true,
    },
    {
      icon: "fa-users",
      label: "المستخدمون",
      value: totalU,
      sub: `تحويل ${convRate}% لمدفوع`,
    },
    {
      icon: "fa-crown",
      label: "مشتركون نشطون",
      value: paidU,
      sub: "باقات مدفوعة فعّالة",
      gold: true,
    },
    {
      icon: "fa-sack-dollar",
      label: "الإيرادات الموثّقة",
      value: `$${totalRevenueUsd}`,
      sub: `${(totalRevenueUsd * 15000).toLocaleString("en-US")} ل.س`,
      gold: true,
    },
    {
      icon: "fa-bell",
      label: "بانتظار تدقيقك",
      value: totalPendingAudit,
      sub: totalPendingAudit > 0 ? "راجع معاملات اليوم" : "كل الحوالات مدقّقة ✓",
      alert: totalPendingAudit > 0,
    },
  ];

  return (
    <main className="admin-page">
      <RevealOnScroll />

      {/* رأس اللوحة الفاخر */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-identity">
            <span className="mithaq-logo-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mithaq-logo-transparent.svg" alt="شعار ميثاق" width={50} height={50} />
            </span>
            <div>
              <div className="admin-kicker">
                <i className="fas fa-crown" style={{ marginLeft: 6 }} />
                مركز قيادة ميثاق — الإدارة التنفيذية
              </div>
              <h1 className="admin-title">نبض المنصة، لحظة بلحظة</h1>
            </div>
          </div>
          <div className="admin-header-actions">
            <TelegramTestButton />
            <Link className="btn btn-outline" href="/">
              <i className="fas fa-house" />
              المنصة
            </Link>
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

        {/* شريط جاهزية الإطلاق والربط */}
        <div className="admin-readiness-bar">
          <div className="arb-head">
            <i className="fas fa-shield-halved" />
            <span>
              جاهزية الإطلاق:{" "}
              <b>
                {readiness.readyCount}/{readiness.total}
              </b>
            </span>
          </div>
          <div className="arb-pills">
            {readiness.items.map((item) => (
              <span
                key={item.id}
                className={`arb-pill ${item.ok ? "ok" : "miss"}`}
                title={item.ok ? `${item.label} مفعّل وجاهز` : `أضف ${item.hint} في Vercel`}
              >
                <i className={item.icon.startsWith("fab ") ? item.icon : `fas ${item.icon}`} />
                <span>{item.label}</span>
                <i className={`fas ${item.ok ? "fa-circle-check" : "fa-circle-xmark"} arb-st`} />
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* بطاقات الإحصائيات التنفيذية */}
      <section className="admin-stats reveal">
        {stats.map((s) => (
          <div
            className={`admin-stat${s.gold ? " gold" : ""}${s.alert ? " alert" : ""}`}
            key={s.label}
          >
            <div className="admin-stat-icon">
              <i className={`fas ${s.icon}`} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="admin-stat-value">{s.value}</div>
              <div className="admin-stat-label">{s.label}</div>
              <div className="admin-stat-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </section>

      {/* تنبيه ذكي عند نقص بيانات المحافظ قبل إطلاق البيع */}
      {missingPayments.length > 0 && (
        <section className="admin-launch-banner reveal">
          <div className="alb-icon">
            <i className="fas fa-wallet" />
          </div>
          <div className="alb-body">
            <b>بوابة استقبال المدفوعات بحاجة لاستكمال الربط في Vercel:</b>{" "}
            <span>
              المفقود حالياً:{" "}
              {missingPayments.map((m) => `${m.label} (${m.hint})`).join(" · ")}. بمجرد
              إضافتها في إعدادات Vercel وإعادة النشر ستتحول الشارات أعلاه إلى الأخضر ويفتح
              الدفع للعملاء تلقائياً.
            </span>
          </div>
        </section>
      )}

      {/* مخطط نبض النمو لآخر 14 يوماً */}
      <section
        className="admin-panel admin-pulse-panel reveal"
        style={{ maxWidth: 1160, margin: "18px auto 0" }}
      >
        <div className="admin-panel-head" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <i className="fas fa-chart-line" />
            <h2>نبض النمو — آخر 14 يوماً</h2>
          </div>
          <div className="pulse-legend">
            <span>
              <i className="pulse-dot contracts" /> عقود جديدة ({recentContractDates.length})
            </span>
            <span>
              <i className="pulse-dot users" /> تسجيلات جديدة ({recentUserDates.length})
            </span>
          </div>
        </div>

        <div className="admin-pulse-chart" role="img" aria-label="مخطط العقود والتسجيلات اليومية لآخر 14 يوماً">
          {dayBuckets.map((d) => (
            <div className="pulse-col" key={d.key} title={`${d.key}: ${d.contracts} عقد · ${d.users} مستخدم`}>
              <div className="pulse-bars">
                <span
                  className="pulse-bar contracts"
                  style={{
                    height: `${d.contracts > 0 ? Math.max(12, Math.round((d.contracts / maxDaily) * 100)) : 4}%`,
                    opacity: d.contracts > 0 ? 1 : 0.22,
                  }}
                >
                  {d.contracts > 0 && <em>{d.contracts}</em>}
                </span>
                <span
                  className="pulse-bar users"
                  style={{
                    height: `${d.users > 0 ? Math.max(12, Math.round((d.users / maxDaily) * 100)) : 4}%`,
                    opacity: d.users > 0 ? 1 : 0.22,
                  }}
                >
                  {d.users > 0 && <em>{d.users}</em>}
                </span>
              </div>
              <span className="pulse-day">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* المستخدمون — إدارة كاملة مع العدّاد الدقيق + درج العقود + تصدير CSV */}
      <UsersManager currentAdminId={session?.user?.dbId || ""} />

      {/* معاملات شام كاش — قائمتا unverified/verified مع أزرار التأكيد والتجميد وواتساب */}
      <TransactionsManager />

      {/* طلبات الدفع — USDT / شام كاش */}
      <PaymentsManager
        requests={payReqs.map((r) => ({
          id: r.id,
          userId: r.userId,
          plan: r.plan,
          amountUsd: r.amountUsd,
          method: r.method,
          status: r.status,
          txRef: r.txRef,
          createdAt: r.createdAt.toISOString(),
        }))}
      />

      {/* لوحة الأخطاء الحية — أي عطل يُلتقط تلقائياً ويظهر هنا */}
      <ErrorsManager />

      <div className="admin-grid">
        {/* مستكشف كل العقود (بحث + فلترة + معاينة + حذف العقود التجريبية) */}
        <ContractsManager />

        {/* الجانب: سجل الأحداث + أكثر القوالب + المشرفون */}
        <div className="admin-side">
          <LogsManager />

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
        <span className="gold">مِــيــثَــاق</span> — مركز القيادة · البيانات مباشرة من Neon
      </footer>
    </main>
  );
}
