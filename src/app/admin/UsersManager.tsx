"use client";

/* ============================================================
   UsersManager — قسم المستخدمين المطوّر في لوحة الأدمن
   - يعرض العدد الدقيق للعقود (المنشأة + المشاركة كطرف ثانٍ)
   - زر «عرض العقود» لكل مستخدم يفتح قائمة عقوده مباشرة مع روابط المعاينة
   - فلتر «قريب للترقية» للعملاء الذين وصلوا 2/3 أو 3/3 عقود مجانية
   - شارة «مجمّد» للحسابات الموقوفة مالياً وتنبيه بالعقود غير المرتبطة بمالك
   - تصدير CSV آمن (مع حماية من حقن معادلات Excel)
   ============================================================ */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { arDate } from "@/lib/format";
import { PAID_PLANS } from "@/lib/plans";
import { contractTypeName } from "@/lib/contract-types";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  picture: string | null;
  plan: string;
  planExpiresAt: string | null;
  paidOnce: boolean;
  isAdmin: boolean;
  isSuspended?: boolean;
  createdAt: string;
  lastSeenAt: string;
  ownedContractsCount?: number;
  participatedContractsCount?: number;
  thisMonthCount?: number;
  contractsCount: number;
};

type UserContractItem = {
  id: string;
  type: string;
  status: string;
  party1Name: string;
  party2Name: string;
  amount: string;
  city: string;
  role: "owner" | "party2";
  createdAt: string;
};

const PLAN_NAMES: Record<string, string> = {
  free: "مجاني",
  single: "العقد الواحد",
  basic: "أساسي",
  verified: "موثّق",
  freelancer: "المستقل",
  office: "المكاتب",
};

type PlanFilter = "all" | "paid" | "hot" | "free" | "admin" | "expired";

function isExpired(u: AdminUser): boolean {
  return (
    u.plan !== "free" &&
    u.plan !== "single" &&
    !!u.planExpiresAt &&
    new Date(u.planExpiresAt).getTime() < Date.now()
  );
}

function isHotLead(u: AdminUser): boolean {
  return !u.isAdmin && u.plan === "free" && (u.thisMonthCount || 0) >= 2;
}

/** تنظيف خلايا CSV لمنع هجمات حقن معادلات Excel (=, +, -, @, tab, cr) */
function safeCsvCell(value: unknown): string {
  let s = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export default function UsersManager({ currentAdminId }: { currentAdminId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  /* درج عقود المستخدم القابل للفتح */
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userContracts, setUserContracts] = useState<Record<string, UserContractItem[]>>({});
  const [loadingContractsId, setLoadingContractsId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const j = (await res.json()) as {
        ok: boolean;
        users?: AdminUser[];
        orphanContractsCount?: number;
        message?: string;
      };
      if (res.ok && j.ok && j.users) {
        setUsers(j.users);
        setOrphanCount(j.orphanContractsCount || 0);
      } else {
        setErr(j.message || "تعذر تحميل المستخدمين.");
      }
    } catch {
      setErr("تعذر الاتصال — تحقق من الإنترنت.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function toggleContractsDrawer(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    if (userContracts[userId]) return;

    setLoadingContractsId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/contracts`, { cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; contracts?: UserContractItem[] };
      if (res.ok && j.ok && j.contracts) {
        setUserContracts((prev) => ({ ...prev, [userId]: j.contracts! }));
      }
    } catch {
      setToast({ ok: false, text: "تعذر تحميل عقود هذا المستخدم." });
    } finally {
      setLoadingContractsId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
      if (filter === "admin" && !u.isAdmin) return false;
      if (filter === "free" && (u.plan !== "free" || u.isAdmin)) return false;
      if (filter === "paid" && (u.plan === "free" || u.isAdmin)) return false;
      if (filter === "hot" && !isHotLead(u)) return false;
      if (filter === "expired" && !isExpired(u)) return false;
      return true;
    });
  }, [users, query, filter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      paid: users.filter((u) => u.plan !== "free" && !u.isAdmin).length,
      hot: users.filter(isHotLead).length,
      today: users.filter((u) => Date.now() - new Date(u.createdAt).getTime() < 864e5).length,
      expired: users.filter(isExpired).length,
    }),
    [users]
  );

  function exportCsv() {
    const header = [
      "الاسم",
      "البريد الإلكتروني",
      "الباقة",
      "عقود منشأة",
      "عقود كطرف ثانٍ",
      "إجمالي العقود",
      "عقود هذا الشهر",
      "الحالة",
      "تاريخ الانضمام",
      "آخر ظهور",
    ];
    const lines = [
      header.map(safeCsvCell).join(","),
      ...filtered.map((u) =>
        [
          u.name,
          u.email,
          PLAN_NAMES[u.plan] || u.plan,
          u.ownedContractsCount ?? u.contractsCount,
          u.participatedContractsCount ?? 0,
          u.contractsCount,
          u.thisMonthCount ?? 0,
          u.isSuspended ? "مجمّد" : u.isAdmin ? "مشرف" : "نشط",
          u.createdAt.slice(0, 10),
          u.lastSeenAt.slice(0, 10),
        ]
          .map(safeCsvCell)
          .join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mithaq-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function act(userId: string, body: Record<string, unknown>, confirmMsg?: string) {
    if (busyId) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(userId);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (res.ok && j.ok) {
        setToast({ ok: true, text: j.message || "تم." });
        await load();
      } else {
        setToast({ ok: false, text: j.message || "تعذر تنفيذ الإجراء." });
      }
    } catch {
      setToast({ ok: false, text: "تعذر الاتصال بالخادم." });
    } finally {
      setBusyId(null);
    }
  }

  function changePlan(u: AdminUser, plan: string) {
    if (plan === "__clear") {
      act(u.id, { action: "clear_plan" }, `إعادة ${u.name} إلى الباقة المجانية؟`);
      return;
    }
    const label = PLAN_NAMES[plan] || plan;
    act(u.id, { action: "set_plan", plan }, `تفعيل باقة «${label}» لـ ${u.name}؟`);
  }

  function toggleAdmin(u: AdminUser) {
    const msg = u.isAdmin
      ? `إزالة صلاحية المشرف من ${u.name} (${u.email})؟`
      : `منح صلاحية المشرف الكاملة لـ ${u.name} (${u.email})؟`;
    act(u.id, { action: "toggle_admin" }, msg);
  }

  return (
    <section
      className="admin-panel admin-users-panel reveal"
      style={{ maxWidth: 1160, margin: "20px auto 0" }}
    >
      {/* ترويسة القسم */}
      <div className="admin-panel-head">
        <i className="fas fa-users-gear" />
        <h2>إدارة المستخدمين</h2>
        <span className="admin-users-count">
          {filtered.length} / {users.length}
        </span>
        <button
          type="button"
          className="admin-csv-btn"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title="تصدير الجدول الحالي بصيغة Excel / CSV"
        >
          <i className="fas fa-file-csv" />
          تصدير CSV
        </button>
        <button
          type="button"
          className="admin-users-refresh"
          onClick={load}
          disabled={loading}
          title="تحديث القائمة"
        >
          <i className={`fas fa-rotate${loading ? " fa-spin" : ""}`} />
        </button>
      </div>

      {/* إشعار عائم */}
      {toast && (
        <div className={`admin-toast ${toast.ok ? "ok" : "err"}`}>
          <i className={`fas ${toast.ok ? "fa-circle-check" : "fa-circle-exclamation"}`} />
          <span>{toast.text}</span>
        </div>
      )}

      {/* تنبيه العقود غير المرتبطة بمالك (إن وجدت) */}
      {orphanCount > 0 && (
        <div className="admin-orphan-note">
          <i className="fas fa-circle-info" />
          <span>
            يوجد <b>{orphanCount}</b> عقد في قاعدة البيانات غير مرتبط بحساب مالك (
            <code>owner_id = NULL</code> — غالباً عقود قديمة قبل الترحيل)، ويمكنك تصفّحها من فلتر
            «بلا مالك» في متصفح العقود بالأسفل.
          </span>
        </div>
      )}

      {/* الإحصاءات السريعة */}
      <div className="admin-user-stats">
        <div className="austat">
          <i className="fas fa-users" />
          <div>
            <b>{stats.total}</b>
            <span>إجمالي الحسابات</span>
          </div>
        </div>
        <div className="austat gold">
          <i className="fas fa-crown" />
          <div>
            <b>{stats.paid}</b>
            <span>مشتركون مدفوعون</span>
          </div>
        </div>
        <div className="austat gold">
          <i className="fas fa-fire" />
          <div>
            <b>{stats.hot}</b>
            <span>قريبون للترقية (2–3/3)</span>
          </div>
        </div>
        <div className="austat">
          <i className="fas fa-user-plus" />
          <div>
            <b>{stats.today}</b>
            <span>جديد آخر 24 ساعة</span>
          </div>
        </div>
        <div className="austat warn">
          <i className="fas fa-hourglass-end" />
          <div>
            <b>{stats.expired}</b>
            <span>اشتراكات منتهية</span>
          </div>
        </div>
      </div>

      {/* شريط البحث والفلاتر */}
      <div className="admin-users-tools">
        <div className="admin-search">
          <i className="fas fa-magnifying-glass" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو البريد الإلكتروني…"
            aria-label="ابحث في المستخدمين"
          />
          {query && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => setQuery("")}
              aria-label="مسح البحث"
            >
              <i className="fas fa-xmark" />
            </button>
          )}
        </div>

        <div className="admin-filter-tabs" role="tablist">
          {(
            [
              ["all", "الكل"],
              ["paid", "مدفوع"],
              ["hot", `قريب للترقية${stats.hot ? ` (${stats.hot})` : ""}`],
              ["free", "مجاني"],
              ["expired", `منتهية${stats.expired ? ` (${stats.expired})` : ""}`],
              ["admin", "مشرفون"],
            ] as [PlanFilter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`aftab${filter === id ? " active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="paymgr-err">{err}</div>}

      {/* القائمة */}
      {loading && users.length === 0 ? (
        <div className="admin-empty">
          <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6 }} />
          جارٍ تحميل المستخدمين…
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">
          {users.length === 0
            ? "لا توجد حسابات بعد — أول مستخدم سيظهر هنا فوراً."
            : "لا نتائج مطابقة للبحث أو الفلتر."}
        </div>
      ) : (
        <ul className="admin-users-list">
          {filtered.map((u) => {
            const isSelf = u.id === currentAdminId;
            const expired = isExpired(u);
            const hot = isHotLead(u);
            const isExpanded = expandedUserId === u.id;
            const owned = u.ownedContractsCount ?? u.contractsCount;
            const part2 = u.participatedContractsCount ?? 0;
            const drawerItems = userContracts[u.id] || [];

            return (
              <li
                key={u.id}
                className={`admin-user-item${u.isAdmin ? " is-admin" : ""}`}
              >
                <div className="admin-user-row">
                  <div className="aur-avatar">
                    {u.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.picture} alt={u.name} referrerPolicy="no-referrer" />
                    ) : (
                      <i className="fas fa-user" />
                    )}
                    {u.isAdmin && (
                      <span className="aur-crown" title="مشرف">
                        <i className="fas fa-shield-halved" />
                      </span>
                    )}
                  </div>

                  <div className="aur-main">
                    <div className="aur-name">
                      {u.name}
                      {isSelf && <span className="aur-self">أنت</span>}
                      {u.isSuspended && <span className="admin-badge b-suspended">مجمّد</span>}
                      {hot && (
                        <span className="admin-badge b-hot" title="استهلك معظم الحد المجاني هذا الشهر">
                          🔥 {u.thisMonthCount}/3 هذا الشهر
                        </span>
                      )}
                    </div>
                    <div className="aur-email" dir="ltr">
                      {u.email}
                    </div>
                    <div className="aur-meta">
                      <button
                        type="button"
                        className="aur-contracts-btn"
                        onClick={() => toggleContractsDrawer(u.id)}
                        title="عرض جميع عقود هذا الحساب"
                      >
                        <i className="fas fa-file-contract" />{" "}
                        <b>{u.contractsCount}</b> عقد
                        {part2 > 0 && (
                          <small>
                            {" "}
                            (أنشأ {owned} · طرف ثانٍ {part2})
                          </small>
                        )}
                        <i
                          className={`fas fa-chevron-${isExpanded ? "up" : "down"}`}
                          style={{ fontSize: 9, marginInlineStart: 4 }}
                        />
                      </button>
                      <span title="تاريخ الانضمام">
                        <i className="fas fa-calendar" /> انضم {arDate(u.createdAt)}
                      </span>
                      <span title="آخر نشاط">
                        <i className="fas fa-clock" /> آخر ظهور {arDate(u.lastSeenAt)}
                      </span>
                    </div>
                  </div>

                  <div className="aur-side">
                    {/* الباقة الحالية */}
                    <span
                      className={`admin-badge ${
                        u.isAdmin
                          ? "b-signed"
                          : expired
                            ? "b-expired"
                            : u.plan === "free"
                              ? "b-draft"
                              : "b-partial"
                      }`}
                    >
                      {u.isAdmin ? "مشرف" : PLAN_NAMES[u.plan] || u.plan}
                      {u.plan !== "free" && u.planExpiresAt && (
                        <small> · {expired ? "منتهية" : `حتى ${arDate(u.planExpiresAt)}`}</small>
                      )}
                    </span>

                    {/* تغيير الباقة */}
                    {!u.isAdmin && (
                      <select
                        className="aur-plan-select"
                        value={u.plan === "free" ? "__none" : u.plan}
                        disabled={busyId === u.id}
                        onChange={(e) => changePlan(u, e.target.value)}
                        aria-label={`تغيير باقة ${u.name}`}
                      >
                        <option value="__none" disabled>
                          تغيير الباقة…
                        </option>
                        {PAID_PLANS.filter((p) => !p.service).map((p) => (
                          <option key={p.id} value={p.id}>
                            ترقية إلى: {PLAN_NAMES[p.id] || p.title}
                          </option>
                        ))}
                        {u.plan !== "free" && (
                          <option value="__clear">↩ إعادة للمجانية</option>
                        )}
                      </select>
                    )}

                    {/* ترقية / إزالة مشرف */}
                    {!isSelf && (
                      <button
                        type="button"
                        className={`aur-admin-btn${u.isAdmin ? " revoke" : ""}`}
                        disabled={busyId === u.id}
                        onClick={() => toggleAdmin(u)}
                        title={u.isAdmin ? "إزالة صلاحية المشرف" : "ترقية إلى مشرف"}
                      >
                        <i
                          className={`fas ${u.isAdmin ? "fa-user-minus" : "fa-user-shield"}`}
                        />
                        {u.isAdmin ? "إزالة الإشراف" : "ترقية لمشرف"}
                      </button>
                    )}
                  </div>
                </div>

                {/* درج عقود المستخدم */}
                {isExpanded && (
                  <div className="admin-user-drawer">
                    {loadingContractsId === u.id ? (
                      <div className="aud-empty">
                        <i className="fas fa-spinner fa-spin" /> جارٍ جلب عقود {u.name}…
                      </div>
                    ) : drawerItems.length === 0 ? (
                      <div className="aud-empty">
                        لا توجد عقود مسجّلة باسم هذا الحساب (لا كمنشئ ولا كطرف ثانٍ).
                      </div>
                    ) : (
                      <ul className="aud-list">
                        {drawerItems.map((c) => (
                          <li key={c.id} className="aud-row">
                            <Link href={`/admin/contracts/${c.id}`} className="aud-link">
                              <span className="aud-title">
                                عقد {contractTypeName(c.type)} — {c.party1Name} ↔ {c.party2Name}
                              </span>
                              <span className="aud-meta">
                                <span
                                  className={`admin-badge ${
                                    c.role === "owner" ? "b-partial" : "b-draft"
                                  }`}
                                >
                                  {c.role === "owner" ? "منشئ" : "طرف ثانٍ"}
                                </span>
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
                                {c.amount && <small>{c.amount}</small>}
                                <small>{arDate(c.createdAt)}</small>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
