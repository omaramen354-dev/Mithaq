"use client";

import ContractTypePicker from "./ContractTypePicker";

/* ============================================================
   MithaqHeroButtons — إجراءات الهيرو (v3)
   زر الإنشاء المباشر أُزيل بطلب المستخدم — تبقى قائمة
   أنواع العقود المنبثقة كمشغّل رئيسي داخل الهيرو،
   مع بقاء قسم أنواع العقود الكامل في الصفحة.
   ============================================================ */

export default function MithaqHeroButtons() {
  return (
    <div className="hero-actions">
      <ContractTypePicker variant="hero" />
    </div>
  );
}
