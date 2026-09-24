"use client";

/* ============================================================
   MithaqHeroButtons — الأزرار التفاعلية للهيرو الأسطوري (v1)
   مخصص كـ Client Component منفصل لاستقبال الـ Event handlers
   من سياق التطبيق (Server Page) دون كسر حدود الاتصال بين
   السيرفر والويب.
   ============================================================ */

export default function MithaqHeroButtons() {
  function scrollToCreate() {
    document.getElementById("create")?.scrollIntoView({ behavior: "smooth" });
  }

  function scrollToTypes() {
    document.getElementById("types")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="hero-actions">
      <button className="btn btn-primary" onClick={scrollToCreate}>
        <i className="fas fa-file-circle-plus" />
        إنشاء عقد جديد
      </button>
      <button className="btn btn-outline" onClick={scrollToTypes}>
        <i className="fas fa-layer-group" />
        استعراض القوالب
      </button>
    </div>
  );
}
