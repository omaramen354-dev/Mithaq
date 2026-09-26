"use client";

import Image from "next/image";
import MithaqHeroButtons from "./MithaqHeroButtons";

/* ============================================================
   MithaqHero — الهيرو الأسطوري (v2)
   نقشة السداسيات + اللوغو الجديد داخل صندوقه الأخضر الداكن
   + بطاقة الوثيقة الزجاجية بإمالة 3D، مع قائمة أنواع العقود
   المنبثقة المدمجة ضمن الأزرار بدل القسم المنفصل.
   ============================================================ */

export default function MithaqHero() {
  return (
    <section className="hero">
      {/* نقشة السداسيات الزخرفية — نفس SVG الأصلي */}
      <div className="hero-ornament" aria-hidden="true">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="and1"
              x="0"
              y="0"
              width="90"
              height="90"
              patternUnits="userSpaceOnUse"
            >
              <g fill="none" stroke="#ffffff" strokeWidth="0.7">
                <polygon points="45,3 84,25 84,65 45,87 6,65 6,25"></polygon>
                <polygon points="45,14 72,30 72,60 45,76 18,60 18,30"></polygon>
                <polygon points="45,25 60,34 60,56 45,65 30,56 30,34"></polygon>
                <line x1="45" y1="3" x2="45" y2="87"></line>
                <line x1="6" y1="25" x2="84" y2="65"></line>
                <line x1="84" y1="25" x2="6" y2="65"></line>
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#and1)"></rect>
        </svg>
      </div>

      <div className="hero-content">
        <div className="platform-name-banner">
          <div className="platform-logo-inline">
            {/* اللوغو الجديد — من ملف add داخل صندوقه الأخضر الداكن */}
            <span className="mithaq-logo-box">
              <Image
                src="/mithaq-logo.svg"
                alt="شعار ميثاق"
                width={56}
                height={33}
                priority
              />
            </span>
            <span className="platform-name-text">منصة ميثاق</span>
          </div>
          <div className="platform-name-sep"></div>
          <div className="hero-badge">
            <i className="fas fa-wand-magic-sparkles" />
            عقود • PDF • توقيع • تحقق
          </div>
        </div>

        <h1>
          أنشئ عقدك
          <br />
          <span>بثقة وسهولة</span>
        </h1>
        <div className="hero-tagline">عقودك بثقة وسهولة — في دقائق</div>
        <p className="lead">
          أنشئ عقداً، عدّل البنود، أضف توقيعاً رقمياً، شارك رابطاً عاماً، واطبع
          PDF ببصمة تحقق SHA-256 — كل ذلك من مكان واحد.
        </p>

        <MithaqHeroButtons />
      </div>

      {/* بطاقة الوثيقة الزجاجية بإمالة 3D */}
      <div className="hero-visual">
        <div className="hero-card-mockup">
          <div className="mockup-header">
            <div className="mockup-icon">
              <i className="fas fa-file-contract" />
            </div>
            <div>
              <div className="mockup-title">وثيقة ميثاق</div>
              <div className="mockup-subtitle">عقد إلكتروني قابل للطباعة</div>
            </div>
          </div>
          <div className="mockup-lines">
            <div className="mockup-line gold"></div>
            <div className="mockup-line w-full"></div>
            <div className="mockup-line w-80"></div>
            <div className="mockup-line w-60"></div>
            <div className="mockup-line w-full"></div>
            <div className="mockup-line w-45"></div>
          </div>
          <div className="mockup-badge">
            <i className="fas fa-shield-halved" />
            موثّقة ومحمية
          </div>
        </div>
      </div>
    </section>
  );
}
