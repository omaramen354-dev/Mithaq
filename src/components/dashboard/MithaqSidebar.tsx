"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";

/* ============================================================
   MithaqSidebar — السايدبار الزمردي الأسطوري (v1)
   نفس بنية القائمة الأصلية: الشعار الكوفي + مِــيــثَــاق MITHAQ
   + أقسام (الرئيسية / إدارة / الحساب) + بطاقة الدخول بالأسفل.
   التنقل حقيقي الآن: / لوحة العقود، /#create إنشاء عقد.
   ============================================================ */

type SidebarMode = "guest" | "user";

export default function MithaqSidebar({
  mode,
  userName,
  userPicture,
  contractsCount,
  signOutAction,
}: {
  mode: SidebarMode;
  userName?: string | null;
  userPicture?: string | null;
  contractsCount: number;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const go = (hash: string) => {
    setOpen(false);
    if (hash === "top") {
      window.location.hash = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <>
      {/* زر الفتح للجوال */}
      <button
        className="icon-btn"
        style={{ display: "none" }}
        aria-label="فتح القائمة"
        onClick={() => setOpen(true)}
        id="sidebarOpenBtn"
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99,
            background: "rgba(8,25,20,0.5)",
          }}
        />
      )}

      <aside
        className={`sidebar${open ? " open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sidebar-logo">
          <Image
            className="logo-svg-wrap"
            src="/mithaq-logo.svg"
            alt="شعار ميثاق — كوفي مربع"
            width={38}
            height={38}
          />
          <div className="logo-text-block">
            <span className="arabic">مِــيــثَــاق</span>
            <span className="english">MITHAQ</span>
          </div>
        </div>

        <div className="sidebar-tagline">منظومة العقود والتوثيق الإلكتروني</div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">الرئيسية</div>
          <button className="nav-link active" onClick={() => go("top")}>
            <i className="ico fas fa-house" />
            <span>لوحة التحكم</span>
          </button>
          <button className="nav-link" onClick={() => go("create")}>
            <i className="ico fas fa-file-circle-plus" />
            <span>إنشاء عقد جديد</span>
          </button>

          <div className="nav-section-title" style={{ marginTop: 10 }}>
            إدارة
          </div>
          <button className="nav-link" onClick={() => go("contracts")}>
            <i className="ico fas fa-file-contract" />
            <span>العقود</span>
            <span className="nav-badge">{contractsCount}</span>
          </button>
          <button className="nav-link" onClick={() => go("types")}>
            <i className="ico fas fa-layer-group" />
            <span>القوالب</span>
          </button>
          <button className="nav-link" onClick={() => go("features")}>
            <i className="ico fas fa-shield-halved" />
            <span>المميزات</span>
          </button>

          <div className="nav-section-title" style={{ marginTop: 10 }}>
            الحساب
          </div>
          {mode === "user" ? (
            <form action={signOutAction}>
              <button className="nav-link" type="submit">
                <i className="ico fas fa-right-from-bracket" />
                <span>تسجيل الخروج</span>
              </button>
            </form>
          ) : (
            <button
              className="nav-link"
              onClick={() => signIn("google", { callbackUrl: "/" })}
            >
              <i className="ico fas fa-right-to-bracket" />
              <span>تسجيل الدخول</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">
              {mode === "user" && userPicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userPicture} alt="" />
              ) : mode === "user" && userName ? (
                userName.trim().charAt(0) || "م"
              ) : (
                <i className="fas fa-user" style={{ fontSize: 13 }} />
              )}
            </div>
            <div className="user-info">
              <div className="name">
                {mode === "user" ? userName || "مستخدم ميثاق" : "زائر"}
              </div>
              <div className="role">
                {mode === "user" ? "حساب موثّق — Google" : "دخول اختياري"}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
