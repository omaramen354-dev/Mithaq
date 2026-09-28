"use client";

/* ============================================================
   MithaqHeroButtons — إجراءات الهيرو (v4)
   أُزيل منها منتقي أنواع العقود بطلب المستخدم — اختيار النوع
   صار من السايدبار أو من قسم القوالب في الصفحة.
   ============================================================ */

export default function MithaqHeroButtons() {
  function openContractModal() {
    window.dispatchEvent(new CustomEvent("mithaq:open-contract-modal"));
  }

  return (
    <div className="hero-actions">
      <button className="btn btn-primary" onClick={openContractModal}>
        <i className="fas fa-file-circle-plus" />
        إنشاء عقد جديد
      </button>
      <button
        className="btn btn-outline"
        onClick={() =>
          document.getElementById("types")?.scrollIntoView({ behavior: "smooth" })
        }
      >
        <i className="fas fa-layer-group" />
        استعراض القوالب
      </button>
    </div>
  );
}
