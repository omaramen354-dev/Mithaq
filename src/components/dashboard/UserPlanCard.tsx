"use client";

/* ============================================================
   UserPlanCard — بطاقة حالة الحساب في السايدبار (للمسجلين)
   تعرض الاسم + شارة الباقة + تاريخ انتهاء الاشتراك الشهري +
   عداد العقود، مع CTA ترقية للباقة المجانية. للضيف تبقى مخفية
   (بطاقة الضيف الأصلية تبقى كما هي في MithaqSidebar).
   ============================================================ */

type Props = {
  userName: string;
  userPicture?: string | null;
  plan: string;
  planExpiresAt?: string | null;
  contractsCount: number;
};

const PLAN_META: Record<
  string,
  { label: string; icon: string; cls: string }
> = {
  free: { label: "مجانية", icon: "fa-seedling", cls: "upc-free" },
  single: { label: "العقد الواحد", icon: "fa-file-circle-check", cls: "upc-paid" },
  basic: { label: "أساسية", icon: "fa-file-contract", cls: "upc-paid" },
  verified: { label: "موثّقة", icon: "fa-stamp", cls: "upc-paid" },
  freelancer: { label: "المستقل", icon: "fa-laptop-code", cls: "upc-gold" },
  office: { label: "المكاتب", icon: "fa-briefcase", cls: "upc-gold" },
};

export default function UserPlanCard({
  userName,
  userPicture,
  plan,
  planExpiresAt,
  contractsCount,
}: Props) {
  const meta = PLAN_META[plan] || PLAN_META.free;

  /* الاشتراك الشهري منتهٍ؟ نعرض تحذيراً لطيفاً */
  const monthlyExpired =
    (plan === "freelancer" || plan === "office") &&
    planExpiresAt &&
    new Date(planExpiresAt).getTime() < Date.now();

  const daysLeft = planExpiresAt
    ? Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / 864e5)
    : null;

  const expiresLabel = planExpiresAt
    ? new Date(planExpiresAt).toLocaleDateString("ar-SY", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className={`upc ${meta.cls}`}>
      <div className="upc-top">
        <div className="upc-avatar">
          {userPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userPicture} alt="" referrerPolicy="no-referrer" />
          ) : (
            (userName || "م").trim().charAt(0) || "م"
          )}
        </div>
        <div className="upc-id">
          <div className="upc-name">{userName || "مستخدم ميثاق"}</div>
          <div className="upc-plan">
            <i className={`fas ${meta.icon}`} />
            خطة {meta.label}
          </div>
        </div>
      </div>

      <div className="upc-meta">
        <span className="upc-chip" title="عقودك المحفوظة">
          <i className="fas fa-file-contract" />
          {contractsCount} عقد
        </span>
        {monthlyExpired ? (
          <span className="upc-chip warn" title="جدّد اشتراكك لاستعادة المزايا">
            <i className="fas fa-triangle-exclamation" />
            اشتراك منتهٍ
          </span>
        ) : expiresLabel && plan !== "free" ? (
          <span
            className="upc-chip"
            title={`ينتهي الاشتراك في ${expiresLabel}`}
          >
            <i className="fas fa-hourglass-half" />
            {daysLeft !== null && daysLeft <= 7
              ? `${daysLeft} أيام متبقية`
              : `حتى ${expiresLabel}`}
          </span>
        ) : plan === "free" ? (
          <a className="upc-chip gold" href="/pricing" title="ترقية الباقة">
            <i className="fas fa-crown" />
            ترقية
          </a>
        ) : null}
      </div>
    </div>
  );
}
