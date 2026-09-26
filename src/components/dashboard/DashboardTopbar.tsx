"use client";

/* ============================================================
   DashboardTopbar — الشريط العلوي (v4)
   - أُزيل شريط «متصل — Neon» بطلب المستخدم (صار حكراً على الأدمن)
   - على الجوال: زر همبرغر يفتح السايدبار (يضغط #sidebarOpenBtn
     الموجود في MithaqSidebar)
   - للمشرفين: زر ذهبي ينقلهم إلى لوحة الأدمن /admin
     (يُمرَّر isAdmin من مكوّن السيرفر — لا حاجة لـ SessionProvider)
   ============================================================ */

export default function DashboardTopbar({ isAdmin = false }: { isAdmin?: boolean }) {
  function openSidebar() {
    const btn = document.getElementById("sidebarOpenBtn") as HTMLButtonElement | null;
    if (btn) btn.click();
  }

  return (
    <header className="topbar">
      <div className="topbar-right">
        <button
          className="icon-btn sidebar-toggle"
          aria-label="فتح القائمة"
          onClick={openSidebar}
          type="button"
        >
          <i className="fas fa-bars" />
        </button>
        <span className="topbar-title">
          <i
            className="fas fa-house"
            style={{ color: "var(--gold-dark)", marginLeft: 7 }}
          />
          ميثاق — لوحة التحكم
        </span>
      </div>
      <div className="topbar-actions">
        {isAdmin && (
          <a className="admin-link-pill" href="/admin" title="لوحة الأدمن">
            <i className="fas fa-user-shield" />
            <span>الأدمن</span>
          </a>
        )}
        <div
          className="icon-btn"
          title="عقد جديد"
          onClick={() => {
            document
              .getElementById("create")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <i className="fas fa-plus" />
        </div>
      </div>
    </header>
  );
}
