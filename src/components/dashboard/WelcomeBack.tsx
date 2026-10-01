"use client";

import { useEffect, useState } from "react";

/* ============================================================
   WelcomeBack — إشعار الترحيب الذكي عند تسجيل الدخول
   يظهر مرة واحدة لكل جلسة (sessionStorage) بهوية ميثاق:
   - مستخدم جديد: ترحيب بالانضمام + دعوة لإنشاء أول عقد
   - مستخدم عائد: مرحباً بعودتك + ملخص حالته (عقود/باقة)
   يمرر من السيرفر: الاسم، الصورة، عدد العقود، الباقة، جديد/عائد.
   ============================================================ */

type WelcomeData = {
  name: string;
  picture?: string | null;
  isNew: boolean;
  contractsCount: number;
  signedCount: number;
  plan: string;
};

const PLAN_LABELS: Record<string, string> = {
  free: "الباقة المجانية",
  single: "العقد الواحد",
  basic: "الأساسية",
  verified: "الموثّقة",
  freelancer: "المستقل",
  office: "المكاتب",
};

export default function WelcomeBack(props: WelcomeData) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    /* مرة واحدة لكل جلسة — لا إزعاج بالتكرار */
    const key = "mithaq-welcome-shown";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, []);

  function close() {
    setLeaving(true);
    setTimeout(() => setVisible(false), 350);
  }

  /* إغلاق تلقائي بعد 9 ثوانٍ */
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(close, 9000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const firstName = (props.name || "صديقنا").trim().split(" ")[0];

  return (
    <div className={`welcome-toast${leaving ? " leaving" : ""}`} role="status">
      <div className="welcome-toast-glow" aria-hidden />
      <div className="welcome-avatar">
        {props.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.picture} alt="" referrerPolicy="no-referrer" />
        ) : (
          <i className="fas fa-user" />
        )}
        <span className="welcome-pulse" aria-hidden />
      </div>

      <div className="welcome-body">
        {props.isNew ? (
          <>
            <b>أهلاً بك في ميثاق، {firstName}! 🎉</b>
            <span>
              حسابك جاهز — أنشئ عقدك الأول الآن، أول 3 عقود مجانية كل شهر.
            </span>
            <button
              type="button"
              className="welcome-cta"
              onClick={() => {
                close();
                window.dispatchEvent(new CustomEvent("mithaq:open-contract-modal"));
              }}
            >
              <i className="fas fa-file-circle-plus" />
              أنشئ عقدك الأول
            </button>
          </>
        ) : (
          <>
            <b>مرحباً بعودتك، {firstName} 👋</b>
            <span className="welcome-stats-line">
              لديك <b>{props.contractsCount}</b> عقد
              {props.signedCount > 0 && (
                <>
                  {" "}منها <b className="gold-txt">{props.signedCount}</b> موقّع بالكامل
                </>
              )}
              {" "}· خطة {PLAN_LABELS[props.plan] || props.plan}
            </span>
            <button
              type="button"
              className="welcome-cta"
              onClick={() => {
                close();
                document
                  .getElementById("contracts")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <i className="fas fa-file-contract" />
              اطّلع على عقودك
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        className="welcome-close"
        onClick={close}
        aria-label="إغلاق الترحيب"
      >
        <i className="fas fa-xmark" />
      </button>
    </div>
  );
}
