/* ============================================================
   DashboardTopbar — الشريط العلوي الأصلي (v1)
   عنوان بأيقونة ذهبية + أزرار دائرية (إشعار + عقد جديد)
   ============================================================ */

export default function DashboardTopbar() {
  return (
    <header className="topbar">
      <div className="topbar-right">
        <span className="topbar-title">
          <i
            className="fas fa-house"
            style={{ color: "var(--gold-dark)", marginLeft: 7 }}
          />
          ميثاق — لوحة التحكم
        </span>
      </div>
      <div className="topbar-actions">
        <span className="server-pill online">متصل — Neon</span>
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
