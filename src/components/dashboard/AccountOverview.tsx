"use client";

import Link from "next/link";
import { arDate } from "@/lib/format";
import type { Contract } from "@/db/schema";

/* ============================================================
   AccountOverview — لوحة حساب العميل الفخمة
   شبكة 4 بطاقات: انتهاء الاشتراك + عقودي + الموقّعة + إنجاز الشهر،
   ثم «آخر العقود المنشأة» مع حالة كل عقد وشارة التحقق،
   وشريط «المستجدات» (آخر نشاط على الحساب).
   كل البيانات تمرر من الخادم — بلا fetch إضافي.
   ============================================================ */

const PLAN_LABELS: Record<string, string> = {
  free: "المجانية",
  single: "العقد الواحد",
  basic: "الأساسية",
  verified: "الموثّقة",
  freelancer: "المستقل",
  office: "المكاتب",
};

const PLAN_ICONS: Record<string, string> = {
  free: "fa-seedling",
  single: "fa-file-circle-check",
  basic: "fa-file-contract",
  verified: "fa-stamp",
  freelancer: "fa-laptop-code",
  office: "fa-briefcase",
};

type Props = {
  userName: string;
  plan: string;
  planExpiresAt: string | null;
  contracts: Contract[];
  memberSince: string | null;
};

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / 864e5);
}

export default function AccountOverview({
  userName,
  plan,
  planExpiresAt,
  contracts,
  memberSince,
}: Props) {
  const planLabel = PLAN_LABELS[plan] || plan;
  const planIcon = PLAN_ICONS[plan] || "fa-seedling";
  const paid = plan !== "free";
  const remaining = daysLeft(planExpiresAt);
  const expired = remaining !== null && remaining <= 0;

  const signed = contracts.filter((c) => c.status === "signed").length;
  const partial = contracts.filter((c) => c.status === "partially_signed").length;
  const drafts = contracts.length - signed - partial;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const thisMonth = contracts.filter((c) => new Date(c.createdAt) >= monthStart).length;

  const firstName = (userName || "صديقنا").trim().split(" ")[0];
  const recent = contracts.slice(0, 5);

  return (
    <section className="section overview-section reveal" id="overview">
      <div className="section-header">
        <div>
          <div className="section-label">نظرة عامة</div>
          <h2 className="section-title">لوحة حسابك، {firstName}</h2>
          <p className="section-sub">
            كل ما يخص اشتراكك وعقودك في نظرة واحدة.
          </p>
        </div>
        <Link className="btn btn-soft btn-sm" href="/pricing">
          <i className="fas fa-crown" />
          إدارة الباقة
        </Link>
      </div>

      {/* ===== شبكة بطاقات الحالة ===== */}
      <div className="overview-grid">
        {/* بطاقة الاشتراك */}
        <div className={`ov-card ov-sub${expired ? " ov-expired" : ""}`}>
          <div className="ov-card-top">
            <span className="ov-ico gold">
              <i className={`fas ${planIcon}`} />
            </span>
            <span className="ov-trend">
              {expired ? (
                <b className="ov-red">منتهٍ</b>
              ) : paid ? (
                <b className="ov-green">فعّال</b>
              ) : (
                <b>مجانية</b>
              )}
            </span>
          </div>
          <div className="ov-value">
            خطة {planLabel}
          </div>
          <div className="ov-foot">
            {expired ? (
              <span className="ov-red">
                <i className="fas fa-triangle-exclamation" /> انتهى اشتراكك — جدّد لاستعادة
                المزايا
              </span>
            ) : remaining !== null && paid ? (
              <span>
                <i className="fas fa-hourglass-half" /> ينتهي خلال{" "}
                <b>{remaining}</b> يوم ({arDate(planExpiresAt)})
              </span>
            ) : paid ? (
              <span>
                <i className="fas fa-infinity" /> دفعة واحدة — بلا انتهاء
              </span>
            ) : (
              <span>
                <i className="fas fa-gift" /> 3 عقود شهرياً — رقِّ للإنتاجية الكاملة
              </span>
            )}
          </div>
          {!paid || expired ? (
            <Link className="ov-cta" href="/pricing">
              <i className="fas fa-bolt" /> ترقية الآن
            </Link>
          ) : null}
        </div>

        {/* إجمالي العقود */}
        <div className="ov-card">
          <div className="ov-card-top">
            <span className="ov-ico">
              <i className="fas fa-file-contract" />
            </span>
          </div>
          <div className="ov-value">{contracts.length}</div>
          <div className="ov-label">إجمالي العقود</div>
          <div className="ov-foot">
            <span>
              {thisMonth} هذا الشهر · عضو منذ {memberSince ? arDate(memberSince) : "اليوم"}
            </span>
          </div>
        </div>

        {/* الموقّعة */}
        <div className="ov-card">
          <div className="ov-card-top">
            <span className="ov-ico green">
              <i className="fas fa-signature" />
            </span>
          </div>
          <div className="ov-value">
            {signed}
            <small> / {contracts.length}</small>
          </div>
          <div className="ov-label">موقّعة من الطرفين</div>
          <div className="ov-foot">
            <span>
              {partial > 0 ? `${partial} بتوقيع جزئي · ` : ""}
              {drafts > 0 ? `${drafts} قيد التوقيع` : "كل شيء مكتمل 🎉"}
            </span>
          </div>
        </div>

        {/* نسبة الإنجاز */}
        <div className="ov-card">
          <div className="ov-card-top">
            <span className="ov-ico green">
              <i className="fas fa-chart-simple" />
            </span>
          </div>
          <div className="ov-value">
            {contracts.length ? Math.round((signed / contracts.length) * 100) : 0}
            <small>%</small>
          </div>
          <div className="ov-label">نسبة الإكمال</div>
          <div className="ov-progress" aria-hidden>
            <span
              style={{
                width: `${contracts.length ? Math.round((signed / contracts.length) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* ===== آخر العقود المنشأة ===== */}
      <div className="overview-recent">
        <div className="overview-recent-head">
          <h3>
            <i className="fas fa-clock-rotate-left" />
            آخر العقود المنشأة
          </h3>
          {contracts.length > recent.length && (
            <a className="view-all" href="#contracts">
              عرض الكل ({contracts.length}) <i className="fas fa-arrow-left" />
            </a>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="ov-empty">
            <i className="fas fa-file-circle-plus" />
            <p>لم تُنشئ أي عقد بعد — ابدأ الآن ووثّق اتفاقك في دقائق</p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("mithaq:open-contract-modal"))
              }
            >
              إنشاء أول عقد
            </button>
          </div>
        ) : (
          <ul className="ov-list">
            {recent.map((c) => {
              const statusCls =
                c.status === "signed"
                  ? "b-signed"
                  : c.status === "partially_signed"
                    ? "b-partial"
                    : "b-draft";
              const statusTxt =
                c.status === "signed"
                  ? "موقّع"
                  : c.status === "partially_signed"
                    ? "توقيع جزئي"
                    : "مسودة";
              return (
                <li key={c.id}>
                  <div className="ov-item-main">
                    <b>
                      {c.party1Name} × {c.party2Name}
                    </b>
                    <span>
                      {arDate(c.createdAt)}
                      {c.amount ? ` · ${c.amount}` : ""}
                    </span>
                  </div>
                  <div className="ov-item-side">
                    <span className={`admin-badge ${statusCls}`}>{statusTxt}</span>
                    <Link
                      className="action-icon"
                      href={`/print/${c.id}`}
                      title="طباعة / PDF"
                    >
                      <i className="fas fa-print" />
                    </Link>
                    <Link
                      className="action-icon"
                      href={`/share/${c.shareToken}`}
                      title="صفحة التوقيع"
                    >
                      <i className="fas fa-paper-plane" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
