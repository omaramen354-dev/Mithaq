"use client";

/* ============================================================
   ErrorsManager — لوحة أخطاء المنصة في الأدمن (عميل)
   جلب حي من /api/errors (entity = error):
   - عرض الأخطاء مع المصدر (متصفح/خادم) وسياق كامل (URL، ستاك، جهاز)
   - نسخ التقرير كاملاً بنقرة — جاهز للصقه وإرساله للمطوّر مباشرة
   - حذف خطأ بعد معالجته أو مسح الكل
   - تحديث تلقائي كل دقيقة + شارة حمراء بعدد الأخطاء الأخيرة
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { arDate } from "@/lib/format";

type ErrorRow = {
  id: string;
  action: string; // error_browser | error_server
  detail: string;
  actorName: string;
  actorEmail: string;
  meta: {
    stack?: string;
    url?: string;
    line?: number | null;
    col?: number | null;
    component?: string;
    userAgent?: string;
    level?: string;
  };
  createdAt: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return arDate(iso);
}

function buildReport(e: ErrorRow): string {
  return [
    "🔻 تقرير خطأ — منصة ميثاق",
    `الوقت: ${new Date(e.createdAt).toLocaleString("ar-SY")}`,
    `المصدر: ${e.action === "error_server" ? "الخادم" : "متصفح المستخدم"}`,
    `الرسالة: ${e.detail}`,
    e.meta.url ? `الصفحة: ${e.meta.url}` : "",
    e.meta.component ? `المكوّن: ${e.meta.component}` : "",
    e.meta.line ? `السطر: ${e.meta.line}:${e.meta.col ?? "?"}` : "",
    e.actorEmail ? `المستخدم: ${e.actorName} (${e.actorEmail})` : "",
    e.meta.userAgent ? `الجهاز: ${e.meta.userAgent}` : "",
    e.meta.stack ? `\nالستاك:\n${e.meta.stack}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function ErrorsManager() {
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"all" | "browser" | "server">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/errors", { cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; errors?: ErrorRow[] };
      if (res.ok && j.ok && j.errors) setErrors(j.errors);
    } catch {
      /* صامت */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(
    () =>
      errors.filter((e) =>
        source === "all"
          ? true
          : source === "browser"
            ? e.action === "error_browser"
            : e.action === "error_server"
      ),
    [errors, source]
  );

  /* الأخطاء خلال آخر 24 ساعة — للشارة الحمراء */
  const last24 = useMemo(
    () => errors.filter((e) => Date.now() - new Date(e.createdAt).getTime() < 864e5).length,
    [errors]
  );

  async function copyReport(e: ErrorRow) {
    try {
      await navigator.clipboard.writeText(buildReport(e));
      setCopiedId(e.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* المتصفح رفض الوصول للحافظة */
    }
  }

  async function remove(id: string) {
    if (!window.confirm("حذف هذا الخطأ بعد معالجته؟")) return;
    await fetch("/api/errors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function clearAll() {
    if (!window.confirm(`مسح كل الأخطاء (${errors.length})؟ لا يمكن التراجع.`)) return;
    await fetch("/api/errors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    load();
  }

  return (
    <section className="admin-panel reveal admin-errors-panel" id="errors">
      <div className="admin-panel-head">
        <i className="fas fa-bug" />
        <h2>الأخطاء</h2>
        {last24 > 0 && <span className="admin-err-badge">{last24} / 24س</span>}
        <span className="admin-users-count">{filtered.length} خطأ</span>
        <button
          type="button"
          className="admin-users-refresh"
          onClick={load}
          disabled={loading}
          title="تحديث"
        >
          <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} />
        </button>
      </div>

      <div className="admin-users-tools">
        <div className="admin-filter-tabs" role="tablist">
          {(
            [
              ["all", "الكل"],
              ["browser", "متصفح"],
              ["server", "خادم"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={source === id}
              className={`aftab${source === id ? " active" : ""}`}
              onClick={() => setSource(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {errors.length > 0 && (
          <button type="button" className="admin-err-clear" onClick={clearAll}>
            <i className="fas fa-trash-can" /> مسح الكل
          </button>
        )}
      </div>

      {loading && errors.length === 0 ? (
        <div className="admin-empty">
          <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6 }} />
          جارٍ التحميل…
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">
          🎉 لا توجد أخطاء — المنصة تعمل بسلاسة. أي خطأ جديد سيظهر هنا فوراً.
        </div>
      ) : (
        <ul className="admin-logs-list admin-errors-list">
          {filtered.map((e) => {
            const isServer = e.action === "error_server";
            const open = openId === e.id;
            return (
              <li key={e.id} className="alog-row err-row">
                <span className={`alog-icon ${isServer ? "t-bad" : "t-warn"}`}>
                  <i className={`fas ${isServer ? "fa-server" : "fa-globe"}`} />
                </span>
                <div className="alog-main">
                  <button
                    type="button"
                    className="err-title"
                    onClick={() => setOpenId(open ? null : e.id)}
                    title={open ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                  >
                    <b>{e.detail}</b>
                    <i className={`fas fa-chevron-${open ? "up" : "down"} err-chev`} />
                  </button>
                  <div className="alog-sub">
                    <span className="err-src">{isServer ? "خادم" : "متصفح"}</span>
                    {e.actorEmail && (
                      <span className="alog-actor">
                        <i className="fas fa-user" /> {e.actorName || e.actorEmail}
                      </span>
                    )}
                    <span className="alog-time">{timeAgo(e.createdAt)}</span>
                    <span className="err-actions">
                      <button
                        type="button"
                        className="err-btn"
                        onClick={() => copyReport(e)}
                        title="نسخ تقرير كامل جاهز للإرسال"
                      >
                        <i
                          className={`fas ${
                            copiedId === e.id ? "fa-check" : "fa-copy"
                          }`}
                        />
                        {copiedId === e.id ? "نُسخ" : "نسخ التقرير"}
                      </button>
                      <button
                        type="button"
                        className="err-btn bad"
                        onClick={() => remove(e.id)}
                        title="حذف"
                      >
                        <i className="fas fa-trash-can" />
                      </button>
                    </span>
                  </div>

                  {open && (
                    <div className="err-details" dir="ltr">
                      {e.meta.url && (
                        <div className="err-line">
                          <b>URL:</b> {e.meta.url}
                        </div>
                      )}
                      {e.meta.component && (
                        <div className="err-line">
                          <b>Component:</b> {e.meta.component}
                        </div>
                      )}
                      {e.meta.line && (
                        <div className="err-line">
                          <b>Location:</b> line {e.meta.line}
                          {e.meta.col ? `:${e.meta.col}` : ""}
                        </div>
                      )}
                      {e.meta.userAgent && (
                        <div className="err-line">
                          <b>UA:</b> {e.meta.userAgent}
                        </div>
                      )}
                      {e.meta.stack && <pre className="err-stack">{e.meta.stack}</pre>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
