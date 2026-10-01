"use client";

/* ============================================================
   LogsManager — سجل أحداث المنصة في لوحة الأدمن (عميل)
   جلب حي من /api/admin/logs مع فلترة حسب نوع الكيان
   (الكل / العقود / الدفعات / المستخدمون / النظام) وتحديث يدوي.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { arDate } from "@/lib/format";

type LogRow = {
  id: string;
  actorName: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  createdAt: string;
};

type EntityFilter = "all" | "contract" | "payment" | "user" | "auth" | "system";

const ACTION_META: Record<string, { icon: string; label: string; tone: "ok" | "warn" | "info" | "bad" }> = {
  contract_created: { icon: "fa-file-circle-plus", label: "إنشاء عقد", tone: "info" },
  contract_signed: { icon: "fa-file-signature", label: "توقيع كامل", tone: "ok" },
  contract_partially_signed: { icon: "fa-pen-nib", label: "توقيع جزئي", tone: "warn" },
  payment_confirmed: { icon: "fa-circle-check", label: "تأكيد دفعة", tone: "ok" },
  payment_rejected: { icon: "fa-ban", label: "رفض دفعة", tone: "bad" },
  payment_request_created: { icon: "fa-hand-holding-dollar", label: "طلب دفع جديد", tone: "info" },
  user_login: { icon: "fa-right-to-bracket", label: "تسجيل دخول", tone: "info" },
  plan_changed: { icon: "fa-crown", label: "تغيير باقة", tone: "warn" },
};

const ENTITY_LABELS: Record<EntityFilter, string> = {
  all: "الكل",
  contract: "العقود",
  payment: "الدفعات",
  user: "المستخدمون",
  auth: "الدخول",
  system: "النظام",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  if (d < 7) return `قبل ${d} يوم`;
  return arDate(iso);
}

export default function LogsManager() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState<EntityFilter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/logs?limit=200", { cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; logs?: LogRow[] };
      if (res.ok && j.ok && j.logs) setLogs(j.logs);
    } catch {
      /* صامت — السجل ليس حرجاً */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* تحديث تلقائي كل 60 ثانية */
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (entity !== "all" && l.entity !== entity) return false;
      if (
        q &&
        !l.detail.toLowerCase().includes(q) &&
        !l.actorName.toLowerCase().includes(q) &&
        !l.action.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [logs, entity, query]);

  return (
    <section className="admin-panel reveal admin-logs-panel">
      <div className="admin-panel-head">
        <i className="fas fa-clock-rotate-left" />
        <h2>سجل الأحداث</h2>
        <span className="admin-users-count">{filtered.length} حدث</span>
        <button
          type="button"
          className="admin-users-refresh"
          onClick={load}
          disabled={loading}
          title="تحديث السجل"
        >
          <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} />
        </button>
      </div>

      <div className="admin-users-tools">
        <div className="admin-search">
          <i className="fas fa-magnifying-glass" />
          <input
            type="search"
            placeholder="ابحث في السجل…"
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
          {(Object.keys(ENTITY_LABELS) as EntityFilter[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={entity === id}
              className={`aftab${entity === id ? " active" : ""}`}
              onClick={() => setEntity(id)}
            >
              {ENTITY_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <div className="admin-empty">
          <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6 }} />
          جارٍ تحميل السجل…
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">
          {logs.length === 0
            ? "السجل فارغ — ستظهر الأحداث هنا تلقائياً (عقود، توقيعات، دفعات)."
            : "لا نتائج مطابقة."}
        </div>
      ) : (
        <ul className="admin-logs-list">
          {filtered.map((l) => {
            const meta = ACTION_META[l.action];
            const tone = meta?.tone || "info";
            return (
              <li key={l.id} className="alog-row">
                <span className={`alog-icon t-${tone}`}>
                  <i className={`fas ${meta?.icon || "fa-circle-info"}`} />
                </span>
                <div className="alog-main">
                  <div className="alog-title">
                    <b>{meta?.label || l.action}</b>
                    {l.detail && <span>{l.detail}</span>}
                  </div>
                  <div className="alog-sub">
                    {l.actorName && (
                      <span className="alog-actor">
                        <i className="fas fa-user" /> {l.actorName}
                      </span>
                    )}
                    <span className="alog-time" title={new Date(l.createdAt).toLocaleString("ar-SY")}>
                      {timeAgo(l.createdAt)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
