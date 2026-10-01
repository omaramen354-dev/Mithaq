"use client";

/* ============================================================
   UsersManager — قسم المستخدمين في لوحة الأدمن (عميل)
   جلب حي من /api/admin/users مع:
   - بحث فوري بالاسم أو البريد
   - فلترة بالباقة (الكل / مجاني / مدفوع / باقة محددة)
   - إحصاءات سريعة (إجمالي، مدفوع، مشرفون، جديد اليوم)
   - ترقية/تخفيض الباقة من قائمة منبثقة
   - ترقية مستخدم إلى مشرف أو إزالة الترقية
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { arDate } from "@/lib/format";
import { PAID_PLANS } from "@/lib/plans";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  picture: string | null;
  plan: string;
  planExpiresAt: string | null;
  paidOnce: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string;
  contractsCount: number;
};

const PLAN_NAMES: Record<string, string> = {
  free: "مجاني",
  single: "العقد الواحد",
  basic: "أساسي",
  verified: "موثّق",
  freelancer: "المستقل",
  office: "المكاتب",
};

type PlanFilter = "all" | "paid" | "free" | "admin" | "expired";

/* هل انتهى اشتراك شهري لهذا المستخدم؟ (المستقل/المكاتب بعد تاريخ الانتهاء) */
function isExpired(u: AdminUser): boolean {
  return (
    (u.plan === "freelancer" || u.plan === "office") &&
    !!u.planExpiresAt &&
    new Date(u.planExpiresAt).getTime() < Date.now()
  );
}

export default function UsersManager({ currentAdminId }: { currentAdminId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; users?: AdminUser[]; message?: string };
      if (res.ok && j.ok && j.users) {
        setUsers(j.users);
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

  /* رسالة نجاح/خطؤ تختفي تلقائياً */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
      if (filter === "admin" && !u.isAdmin) return false;
      if (filter === "free" && (u.plan !== "free" || u.isAdmin)) return false;
      if (filter === "paid" && (u.plan === "free" || u.isAdmin)) return false;
      if (filter === "expired" && !isExpired(u)) return false;
      return true;
    });
  }, [users, query, filter]);

  const stats = useMemo(
    () => ({
      total: users.length,
      paid: users.filter((u) => u.plan !== "free" && !u.isAdmin).length,
      admins: users.filter((u) => u.isAdmin).length,
      today: users.filter(
        (u) => Date.now() - new Date(u.createdAt).getTime() < 864e5
      ).length,
      expired: users.filter(isExpired).length,
    }),
    [users]
  );

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
      setToast({ ok: false, text: "تعذر الاتصال — تحقق من الإنترنت." });
    } finally {
      setBusyId(null);
    }
  }

  async function changePlan(u: AdminUser, planId: string) {
    if (planId === "__none") return;
    if (planId === "free") {
      await act(u.id, { action: "clear_plan" }, `إعادة ${u.name} إلى الباقة المجانية؟`);
      return;
    }
    await act(u.id, { action: "set_plan", plan: planId });
  }

  return (
    <section className="admin-panel reveal admin-users-panel" id="users">
      <div className="admin-panel-head">
        <i className="fas fa-users-gear" />
        <h2>المستخدمون</h2>
        <span className="admin-users-count">{users.length} حساب</span>
        <button
          type="button"
          className="admin-users-refresh"
          onClick={load}
          disabled={loading}
          title="تحديث القائمة"
        >
          <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} />
        </button>
      </div>

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
        <div className="austat">
          <i className="fas fa-user-shield" />
          <div>
            <b>{stats.admins}</b>
            <span>مشرفون</span>
          </div>
        </div>
        <div className="austat">
          <i className="fas fa-user-plus" />
          <div>
            <b>{stats.today}</b>
            <span>انضموا اليوم</span>
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

      {/* البحث والفلترة */}
      <div className="admin-users-tools">
        <div className="admin-search">
          <i className="fas fa-magnifying-glass" />
          <input
            type="search"
            placeholder="ابحث بالاسم أو البريد…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="admin-search-clear" onClick={() => setQuery("")}>
              <i className="fas fa-xmark" />
            </button>
          )}
        </div>
        <div className="admin-filter-tabs" role="tablist">
          {(
            [
              ["all", "الكل"],
              ["paid", "مدفوع"],
              ["expired", "منتهية"],
              ["free", "مجاني"],
              ["admin", "مشرفون"],
            ] as const
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
            const expired =
              u.planExpiresAt ? new Date(u.planExpiresAt).getTime() < Date.now() : false;
            return (
              <li key={u.id} className={`admin-user-row${u.isAdmin ? " is-admin" : ""}`}>
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
                  </div>
                  <div className="aur-email" dir="ltr">
                    {u.email}
                  </div>
                  <div className="aur-meta">
                    <span title="عدد العقود">
                      <i className="fas fa-file-contract" /> {u.contractsCount} عقد
                    </span>
                    <span title="تاريخ الانضمام">
                      <i className="fas fa-calendar" /> {arDate(u.createdAt)}
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
                      {u.plan !== "free" && <option value="free">إعادة إلى المجاني</option>}
                    </select>
                  )}

                  {/* زر المشرف */}
                  {!isSelf && (
                    <button
                      type="button"
                      className={`aur-admin-btn${u.isAdmin ? " on" : ""}`}
                      disabled={busyId === u.id}
                      onClick={() =>
                        u.isAdmin
                          ? act(
                              u.id,
                              { action: "toggle_admin" },
                              `إزالة صلاحية المشرف من ${u.name}؟`
                            )
                          : act(
                              u.id,
                              { action: "toggle_admin" },
                              `ترقية ${u.name} إلى مشرف؟ سيصبح قادراً على إدارة الدفعات والمستخدمين.`
                            )
                      }
                    >
                      <i
                        className={`fas ${
                          busyId === u.id ? "fa-spinner fa-spin" : u.isAdmin ? "fa-user-minus" : "fa-user-shield"
                        }`}
                      />
                      {u.isAdmin ? "إزالة الإشراف" : "ترقية لمشرف"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Toast */}
      {toast && (
        <div className={`admin-toast${toast.ok ? " ok" : " bad"}`} role="status">
          <i className={`fas ${toast.ok ? "fa-circle-check" : "fa-circle-exclamation"}`} />
          {toast.text}
        </div>
      )}
    </section>
  );
}
