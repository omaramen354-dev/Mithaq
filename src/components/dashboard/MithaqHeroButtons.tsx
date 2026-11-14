"use client";

import Link from "next/link";

/* ============================================================
   MithaqHeroButtons — إجراءات الهيرو (v5)
   زر إنشاء عقد جديد + استعراض القوالب + معاينة عقد موقّع حي (/sample)
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
      <Link className="btn btn-outline" href="/sample">
        <i className="fas fa-file-signature" />
        معاينة عقد موقّع
      </Link>
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
