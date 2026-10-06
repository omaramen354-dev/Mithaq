"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import ContractTypePicker from "./ContractTypePicker";
import UserPlanCard from "./UserPlanCard";

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
  plan,
  planExpiresAt,
}: {
  mode: SidebarMode;
  userName?: string | null;
  userPicture?: string | null;
  contractsCount: number;
  signOutAction: () => Promise<void>;
  plan?: string;
  planExpiresAt?: string | null;
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

  const openNewContract = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("mithaq:open-contract-modal"));
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
          <span className="mithaq-logo-box">
            <Image
              src="/mithaq-logo-transparent.svg"
              alt="شعار ميثاق"
              width={46}
              height={46}
              priority
            />
          </span>
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
          <button className="nav-link" onClick={openNewContract}>
            <i className="ico fas fa-file-circle-plus" />
            <span>إنشاء عقد جديد</span>
          </button>
          <div className="sidebar-picker-slot">
            <ContractTypePicker />
          </div>

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
          <button
            className="nav-link"
            onClick={() => {
              setOpen(false);
              window.location.href = "/pricing";
            }}
          >
            <i className="ico fas fa-crown" />
            <span>الباقات والأسعار</span>
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
          {mode === "user" ? (
            <UserPlanCard
              userName={userName || "مستخدم ميثاق"}
              userPicture={userPicture}
              plan={plan || "free"}
              planExpiresAt={planExpiresAt || null}
              contractsCount={contractsCount}
            />
          ) : (
            <div className="user-card">
              <div className="user-avatar">
                <i className="fas fa-user" style={{ fontSize: 13 }} />
              </div>
              <div className="user-info">
                <div className="name">زائر</div>
                <div className="role">دخول اختياري — جرّب المنصة كاملة</div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
