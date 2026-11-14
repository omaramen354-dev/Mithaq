"use client";

/* ============================================================
   ContractsManager — متصفح شامل لكل العقود في لوحة الإدارة
   - بحث فوري بأسماء الأطراف أو المالك أو البريد أو المدينة
   - فلترة حسب الحالة (الكل / موقّع / نصف موقّع / مسودة / بلا مالك) والنوع
   - معاينة فورية لأي عقد + حذف آمن للعقود التجريبية بتأكيد صريح
   ============================================================ */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { arDate } from "@/lib/format";
import { CONTRACT_TYPES, contractTypeName } from "@/lib/contract-types";

type AdminContract = {
  id: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  type: string;
  status: string;
  party1Name: string;
  party2Name: string;
  party2Email: string | null;
  amount: string;
  city: string;
  createdAt: string;
};

type StatusFilter = "all" | "signed" | "partially_signed" | "draft" | "orphan";

export default function ContractsManager() {
  const [items, setItems] = useState<AdminContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams();
      if (query.trim()) sp.set("q", query.trim());
      if (status !== "all") sp.set("status", status);
      if (type !== "all") sp.set("type", type);
      const res = await fetch(`/api/admin/contracts?${sp.toString()}`, {
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok: boolean;
        contracts?: AdminContract[];
        message?: string;
      };
      if (res.ok && j.ok && j.contracts) {
        setItems(j.contracts);
      } else {
        setErr(j.message || "تعذر تحميل العقود.");
      }
    } catch {
      setErr("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }, [query, status, type]);

  useEffect(() => {
    const t = setTimeout(load, query ? 260 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function removeContract(c: AdminContract) {
    if (deletingId) return;
    const ok = window.confirm(
      `هل أنت متأكد من حذف عقد «${contractTypeName(c.type)}» بين ${c.party1Name} و${c.party2Name} نهائياً؟ لا يمكن التراجع عن الحذف.`
    );
    if (!ok) return;
    setDeletingId(c.id);
    try {
      const res = await fetch(`/api/admin/contracts/${c.id}`, { method: "DELETE" });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (res.ok && j.ok) {
        setItems((prev) => prev.filter((x) => x.id !== c.id));
        setToast({ ok: true, text: j.message || "تم حذف العقد." });
      } else {
        setToast({ ok: false, text: j.message || "تعذر حذف العقد." });
      }
    } catch {
      setToast({ ok: false, text: "تعذر الاتصال بالخادم." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="admin-panel reveal">
      <div className="admin-panel-head">
        <i className="fas fa-folder-open" />
        <h2>مستكشف العقود</h2>
        <span className="admin-users-count">{items.length} عقد</span>
        <button
          type="button"
          className="admin-users-refresh"
          onClick={load}
          disabled={loading}
          title="تحديث العقود"
        >
          <i className={`fas fa-rotate${loading ? " fa-spin" : ""}`} />
        </button>
      </div>

      {toast && (
        <div className={`admin-toast ${toast.ok ? "ok" : "err"}`}>
          <i className={`fas ${toast.ok ? "fa-circle-check" : "fa-circle-exclamation"}`} />
          <span>{toast.text}</span>
        </div>
      )}

      <div className="admin-contracts-tools">
        <div className="admin-search">
          <i className="fas fa-magnifying-glass" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث باسم طرف، مالك، مدينة، أو بريد…"
            aria-label="بحث في العقود"
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

        <select
          className="aur-plan-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="فلتر نوع العقد"
        >
          <option value="all">كل الأنواع (11)</option>
          {Object.entries(CONTRACT_TYPES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <div className="admin-filter-tabs" role="tablist">
          {(
            [
              ["all", "الكل"],
              ["signed", "موقّع"],
              ["partially_signed", "نصف موقّع"],
              ["draft", "مسودة"],
              ["orphan", "بلا مالك"],
            ] as [StatusFilter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={status === id}
              className={`aftab${status === id ? " active" : ""}`}
              onClick={() => setStatus(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="paymgr-err">{err}</div>}

      {loading && items.length === 0 ? (
        <div className="admin-empty">
          <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6 }} />
          جارٍ تحميل العقود…
        </div>
      ) : items.length === 0 ? (
        <div className="admin-empty">لا توجد عقود مطابقة لهذا الفلتر.</div>
      ) : (
        <ul className="admin-list">
          {items.map((c) => (
            <li key={c.id} className="admin-contract-item">
              <Link
                className="admin-row admin-contract-link"
                href={`/admin/contracts/${c.id}`}
                title="معاينة العقد الكاملة"
              >
                <div className="admin-row-main">
                  <span className="admin-row-title">
                    عقد {contractTypeName(c.type)}
                    <i
                      className="fas fa-eye"
                      style={{ fontSize: 11, marginInlineStart: 7, color: "var(--gold-dark)" }}
                    />
                  </span>
                  <span className="admin-row-parties">
                    {c.party1Name} ↔ {c.party2Name}
                    {c.amount ? ` · ${c.amount}` : ""}
                    {c.city ? ` · ${c.city}` : ""}
                  </span>
                  <span className="admin-contract-owner">
                    {c.ownerName ? (
                      <>
                        <i className="fas fa-user" /> المالك: {c.ownerName}{" "}
                        <bdi>({c.ownerEmail})</bdi>
                      </>
                    ) : (
                      <span className="owner-orphan">
                        <i className="fas fa-triangle-exclamation" /> غير مرتبط بمالك
                      </span>
                    )}
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
              </Link>
              <button
                type="button"
                className="admin-del-btn"
                onClick={() => removeContract(c)}
                disabled={deletingId === c.id}
                title="حذف هذا العقد (مثلاً عقد تجريبي)"
                aria-label={`حذف عقد ${contractTypeName(c.type)}`}
              >
                <i className={deletingId === c.id ? "fas fa-spinner fa-spin" : "fas fa-trash-can"} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
