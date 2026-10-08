"use client";

/* ============================================================
   TransactionsManager — قائمتا المعاملات في /admin
   القائمة الأولى: الاشتراكات الجديدة غير المؤكدة (unverified)
     - زر [تأكيد الحوالة]      ← verified  (ينقل للقائمة الثانية)
     - زر [تجميد الحساب وإبطال الهاش] ← suspended
     - زر [تواصل عبر الواتساب] ← wa.me برقم contactPhone
   القائمة الثانية: المشتركون المؤكدون (verified) — أرشيف
   يقرأ من /api/admin/transactions ويعيد الجلب بعد كل قرار.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { arDate } from "@/lib/format";
import { findPlan } from "@/lib/plans";

type TxRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  transactionNumber: string;
  contactPhone: string;
  planName: string;
  status: "unverified" | "verified" | "suspended";
  createdAt: string;
  reviewedAt: string | null;
};

const waLink = (phone: string) => {
  /* نحذف الصفر الأول المحلي إن وجد ونفترض سوريا 963 حفاظاً على غموض الأدمن */
  const clean = phone.replace(/\D/g, "").replace(/^0/, "");
  return `https://wa.me/${clean}`;
};

export default function TransactionsManager() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/transactions", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; rows?: TxRow[] };
      if (data.ok && data.rows) setRows(data.rows);
    } catch {
      /* نتجاهل الأخطاء الصامتة — السجل يُخبر المشرف عند الفتح القادم */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "verify" | "suspend" | "unsuspend") {
    const confirmText =
      action === "verify"
        ? "تأكيد الحوالة وتفعيل الباقة؟"
        : action === "suspend"
          ? "سيتم تجميد الحساب وإبطال بصمة SHA-256 ورمز QR لكل عقود المستخدم. متابعة؟"
          : "رفع الحظر وإعادة المعاملة إلى فحص أولي؟";
    if (!window.confirm(confirmText)) return;

    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      setMsg({ ok: data.ok, text: data.message || "" });
      await load();
    } catch {
      setMsg({ ok: false, text: "فشل الاتصال — حاول مجدداً." });
    } finally {
      setBusy(null);
    }
  }

  const unverified = rows.filter((r) => r.status === "unverified");
  const verified = rows.filter((r) => r.status === "verified");
  const suspended = rows.filter((r) => r.status === "suspended");

  if (loading) {
    return (
      <section className="admin-panel reveal">
        <div className="admin-panel-head">
          <i className="fas fa-cash-register" />
          <h2>معاملات شام كاش</h2>
        </div>
        <div className="admin-empty">جارٍ تحميل المعاملات...</div>
      </section>
    );
  }

  return (
    <>
      {msg && (
        <div
          style={{
            margin: "0 0 14px",
            padding: "10px 14px",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 12.5,
            background: msg.ok ? "#e9f6ee" : "#fdecec",
            border: `1.5px solid ${msg.ok ? "#bfe3cd" : "#f5c2c2"}`,
            color: msg.ok ? "#157347" : "#b91c1c",
          }}
        >
          <i className={`fas ${msg.ok ? "fa-circle-check" : "fa-triangle-exclamation"}`} />{" "}
          {msg.text}
        </div>
      )}

      {/* ===== القائمة الأولى: الاشتراكات الجديدة غير المؤكدة ===== */}
      <section className="admin-panel reveal">
        <div className="admin-panel-head">
          <i className="fas fa-hourglass-half" />
          <h2>
            الاشتراكات الجديدة غير المؤكدة{" "}
            <span className="admin-badge b-partial">{unverified.length}</span>
          </h2>
        </div>
        {unverified.length === 0 ? (
          <div className="admin-empty">
            لا توجد طلبات جديدة — كل طلبات شام كاش عولجت حتى الآن.
          </div>
        ) : (
          <ul className="admin-list">
            {unverified.map((r) => (
              <li key={r.id} className="admin-row">
                <div className="admin-row-main">
                  <span className="admin-row-title">
                    <i className="fas fa-mobile-screen" style={{ color: "var(--gold)" }} />
                    {"   "}
                    {findPlan(r.planName)?.title || r.planName} — رقم العملية{" "}
                    <bdi style={{ direction: "ltr" }}>{r.transactionNumber}</bdi>
                  </span>
                  <span className="admin-row-parties">
                    {r.userName || "مستخدم"} · <bdi>{r.userEmail || "—"}</bdi> ·{" "}
                    <bdi dir="ltr">{r.contactPhone}</bdi>
                  </span>
                </div>
                <div className="admin-row-side" style={{ gap: 6, flexWrap: "wrap" }}>
                  <span className="admin-row-date">{arDate(new Date(r.createdAt))}</span>
                  <button
                    className="btn"
                    style={{ padding: "7px 12px", fontSize: 11.5 }}
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "verify")}
                  >
                    <i className="fas fa-hand-holding-dollar" />
                    تأكيد الحوالة
                  </button>
                  <button
                    className="btn"
                    style={{
                      padding: "7px 12px",
                      fontSize: 11.5,
                      background: "linear-gradient(135deg, #c94a4a, #e07a7a)",
                      color: "#fff",
                    }}
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "suspend")}
                  >
                    <i className="fas fa-ban" />
                    تجميد وإبطال الهاش
                  </button>
                  <a
                    className="btn btn-wa"
                    style={{ padding: "7px 12px", fontSize: 11.5 }}
                    href={waLink(r.contactPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="فتح محادثة واتساب مباشرة دون حفظ الرقم"
                  >
                    <i className="fab fa-whatsapp" />
                    واتساب
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== القائمة الثانية: المشتركون المؤكدون (أرشيف) ===== */}
      <section className="admin-panel reveal">
        <div className="admin-panel-head">
          <i className="fas fa-circle-check" />
          <h2>
            المشتركون المؤكدون{" "}
            <span className="admin-badge b-signed">{verified.length}</span>
          </h2>
        </div>
        {verified.length === 0 ? (
          <div className="admin-empty">لا توجد حوالات مؤكدة بعد.</div>
        ) : (
          <ul className="admin-list">
            {verified.map((r) => (
              <li key={r.id} className="admin-row">
                <div className="admin-row-main">
                  <span className="admin-row-title">
                    {findPlan(r.planName)?.title || r.planName} —{" "}
                    <bdi style={{ direction: "ltr" }}>{r.transactionNumber}</bdi>
                  </span>
                  <span className="admin-row-parties">
                    {r.userName || "مستخدم"} · <bdi>{r.userEmail || "—"}</bdi>
                  </span>
                </div>
                <div className="admin-row-side" style={{ gap: 6, flexWrap: "wrap" }}>
                  <span className="admin-row-date">
                    {r.reviewedAt ? `أُكدت ${arDate(new Date(r.reviewedAt))}` : arDate(new Date(r.createdAt))}
                  </span>
                  <button
                    className="btn btn-soft"
                    style={{ padding: "7px 12px", fontSize: 11.5 }}
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "suspend")}
                  >
                    <i className="fas fa-ban" />
                    تجميد الحساب
                  </button>
                  <a
                    className="btn btn-wa"
                    style={{ padding: "7px 12px", fontSize: 11.5 }}
                    href={waLink(r.contactPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i className="fab fa-whatsapp" />
                    واتساب
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== الحسابات المجمّدة (suspended) — للمراجعة بسجل قابل للرفع ===== */}
      {suspended.length > 0 && (
        <section className="admin-panel reveal">
          <div className="admin-panel-head">
            <i className="fas fa-user-slash" />
            <h2>
              الحسابات المجمّدة{" "}
              <span className="admin-badge" style={{ background: "#fdecec", color: "#b91c1c" }}>
                {suspended.length}
              </span>
            </h2>
          </div>
          <ul className="admin-list">
            {suspended.map((r) => (
              <li key={r.id} className="admin-row">
                <div className="admin-row-main">
                  <span className="admin-row-title">
                    {findPlan(r.planName)?.title || r.planName} —{" "}
                    <bdi style={{ direction: "ltr" }}>{r.transactionNumber}</bdi>
                  </span>
                  <span className="admin-row-parties">
                    {r.userName || "مستخدم"} · <bdi>{r.userEmail || "—"}</bdi>
                  </span>
                </div>
                <div className="admin-row-side">
                  <button
                    className="btn btn-soft"
                    style={{ padding: "7px 12px", fontSize: 11.5 }}
                    disabled={busy === r.id}
                    onClick={() => act(r.id, "unsuspend")}
                  >
                    <i className="fas fa-unlock" />
                    رفع الحظر
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
