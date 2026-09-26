"use client";

import ContractTypePicker from "./ContractTypePicker";

/* ============================================================
   MithaqHeroButtons — الأزرار التفاعلية للهيرو الأسطوري (v2)
   زر الإنشاء + قائمة أنواع العقود المنبثقة المدمجة بأسلوب
   الإنديكس القديم بدل قسم القوالب المنفصل.
   ============================================================ */

export default function MithaqHeroButtons() {
  function scrollToCreate() {
    document.getElementById("create")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="hero-actions">
      <button className="btn btn-primary" onClick={scrollToCreate}>
        <i className="fas fa-file-circle-plus" />
        إنشاء عقد جديد
      </button>
      <ContractTypePicker variant="hero" />
    </div>
  );
}
