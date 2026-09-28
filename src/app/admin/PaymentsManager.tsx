"use client";

/* ============================================================
   PaymentsManager — بطاقة طلبات الدفع في لوحة الأدمن (عميل)
   يعرض الطلبات المعلقة أولاً ثم المعالجة، مع تأكيد (يفعّل
   الباقة) أو رفض. بعد كل قرار يُعاد تحميل الصفحة ليتحدث
   إحصاء المشتركين فوراً.
   ============================================================ */

import { useState } from "react";
import { arDate } from "@/lib/format";

type PReq = {
  id: string;
  userId: string | null;
  plan: string;
  amountUsd: string;
  method: string;
  status: string;
  txRef: string | null;
  createdAt: string;
};

const PLAN_NAMES: Record<string, string> = {
  single: "العقد الواحد",
  basic: "أساسي",
  verified: "موثّق",
  freelancer: "المستقل",
  office: "المكاتب",
  legal_review: "مراجعة قانونية",
};

export default function PaymentsManager({ requests }: { requests: PReq[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decide(id: string, action: "paid" | "rejected") {
    if (busyId) return;
    if (
      action === "paid" &&
      !window.confirm("تأكيد استلام الدفعة وتفعيل الباقة على حساب العميل؟")
    ) {
      return;
    }
    if (action === "rejected" && !window.confirm("رفض هذا الطلب؟")) return;
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/payment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (res.ok && j.ok) {
        window.location.reload();
      } else {
        setErr(j.message || "تعذر تنفيذ القرار.");
      }
    } catch {
      setErr("تعذر الاتصال — تحقق من الإنترنت.");
    } finally {
      setBusyId(null);
    }
  }

  if (!requests.length) {
    return (
      <section className="admin-panel reveal">
        <div className="admin-panel-head">
          <i className="fas fa-hand-holding-dollar" />
          <h2>طلبات الدفع</h2>
        </div>
        <div className="admin-empty">
          لا توجد طلبات دفع بعد — ستظهر هنا فوراً عند إرسال أول إثبات.
        </div>
      </section>
    );
  }

  const pending = requests.filter((r) => r.status === "pending" || r.status === "manual_review");
  const done = requests.filter((r) => r.status === "paid" || r.status === "rejected");

  return (
    <section className="admin-panel reveal">
      <div className="admin-panel-head">
        <i className="fas fa-hand-holding-dollar" />
        <h2>طلبات الدفع</h2>
        {pending.length > 0 && <span className="admin-pay-badge">{pending.length} معلّق</span>}
      </div>

      {err && <div className="paymgr-err">{err}</div>}

      {pending.length > 0 && (
        <ul className="admin-list paymgr-list">
          {pending.map((r) => (
            <li key={r.id} className="admin-row paymgr-row">
              <div className="admin-row-main">
                <span className="admin-row-title">
                  {PLAN_NAMES[r.plan] || r.plan} — {r.amountUsd} USDT
                </span>
                <span className="admin-row-parties">
                  {r.method === "usdt" ? "USDT (TRC20)" : "شام كاش"} ·{" "}
                  <code dir="ltr" className="paymgr-tx">
                    {r.txRef || "—"}
                  </code>
                </span>
              </div>
              <div className="admin-row-side">
                <span className="admin-row-date">{arDate(new Date(r.createdAt))}</span>
                <div className="paymgr-actions">
                  <button
                    type="button"
                    className="btn btn-primary paymgr-btn ok"
                    disabled={busyId === r.id}
                    onClick={() => decide(r.id, "paid")}
                  >
                    <i className={`fas ${busyId === r.id ? "fa-spinner fa-spin" : "fa-check"}`} />
                    تأكيد
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline paymgr-btn bad"
                    disabled={busyId === r.id}
                    onClick={() => decide(r.id, "rejected")}
                  >
                    <i className="fas fa-xmark" />
                    رفض
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="paymgr-done">
          <summary>المعالجة سابقاً ({done.length})</summary>
          <ul className="admin-list">
            {done.map((r) => (
              <li key={r.id} className="admin-row">
                <div className="admin-row-main">
                  <span className="admin-row-title">{PLAN_NAMES[r.plan] || r.plan}</span>
                  <span className="admin-row-parties">
                    <code dir="ltr" className="paymgr-tx">
                      {r.txRef || "—"}
                    </code>
                  </span>
                </div>
                <div className="admin-row-side">
                  <span
                    className={`admin-badge ${r.status === "paid" ? "b-signed" : "b-draft"}`}
                  >
                    {r.status === "paid" ? "مؤكد ✓" : "مرفوض"}
                  </span>
                  <span className="admin-row-date">{arDate(new Date(r.createdAt))}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
