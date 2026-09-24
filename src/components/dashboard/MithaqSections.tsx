"use client";

import { CONTRACT_TYPES } from "@/lib/contract-types";

/* ============================================================
   MithaqSections — شريط الإحصائيات + أنواع العقود + المميزات
   بنفس بنية التصميم الأسطوري v1: شريط عاجي بأيقونات زمردية،
   شبكة بطاقات ذهبية الحواف بأيقونات دائرية زمردية.
   ============================================================ */

/* أيقونة Font Awesome لكل نوع عقد — نفس أرواح القوالب القديمة */
const TYPE_ICONS: Record<string, string> = {
  lease: "fa-house",
  sale: "fa-handshake",
  services: "fa-gears",
  freelance: "fa-laptop-code",
  pledge: "fa-scale-balanced",
  supply: "fa-truck-fast",
  partnership: "fa-people-group",
  nda: "fa-user-lock",
  lease_commercial: "fa-shop",
  design: "fa-pen-ruler",
  rent_furnished: "fa-couch",
};

const TYPE_DESCS: Record<string, string> = {
  lease: "إيجار سكني واضح ومتوازن",
  sale: "بيع وشراء نافياً للجهالة",
  services: "تقديم خدمات بنطاق محدد",
  freelance: "أعمال حرة بدفعات مرحلية",
  pledge: "تعهدات وإقرارات ملزمة",
  supply: "توريد مواد وسلع",
  partnership: "شراكة بحصص واضحة",
  nda: "اتفاقية سرية وصمت",
  lease_commercial: "إيجار محلات ومكاتب",
  design: "تصميم وبرمجة وتسليم ملفات",
  rent_furnished: "إيجار مفروش بجرد تفصيلي",
};

const TYPE_BADGE: Record<string, string> = {
  lease: "type-rent",
  sale: "type-sale",
  services: "type-service",
  freelance: "type-freelance",
  pledge: "type-pledge",
  supply: "type-supply",
  partnership: "type-partnership",
  nda: "type-nda",
  lease_commercial: "type-rent",
  design: "type-service",
  rent_furnished: "type-rent",
};

export function StatsBar({ contracts }: { contracts: number }) {
  return (
    <div className="stats-bar">
      <div className="stat-item">
        <div className="stat-icon">
          <i className="fas fa-file-contract" />
        </div>
        <div>
          <div className="stat-num">{contracts}</div>
          <div className="stat-label">عقد منشأ</div>
        </div>
      </div>
      <div className="stat-item">
        <div className="stat-icon">
          <i className="fas fa-layer-group" />
        </div>
        <div>
          <div className="stat-num">{Object.keys(CONTRACT_TYPES).length}</div>
          <div className="stat-label">قالب جاهز</div>
        </div>
      </div>
      <div className="stat-item">
        <div className="stat-icon">
          <i className="fas fa-signature" />
        </div>
        <div>
          <div className="stat-num">دقيقة</div>
          <div className="stat-label">زمن الإنشاء</div>
        </div>
      </div>
      <div className="stat-item">
        <div className="stat-icon">
          <i className="fas fa-shield-halved" />
        </div>
        <div>
          <div className="stat-num">
            100<span style={{ fontSize: 16 }}>%</span>
          </div>
          <div className="stat-label">بصمة SHA-256</div>
        </div>
      </div>
    </div>
  );
}

export function ContractTypes({ onPick }: { onPick?: (type: string) => void }) {
  return (
    <section className="section contracts-section" id="types">
      <div className="section-header">
        <div>
          <div className="section-label">أنواع العقود</div>
          <h2 className="section-title">اختر نوع عقدك</h2>
          <p className="section-sub">
            ابدأ من قالب جاهز ثم عدّل البنود حسب حاجتك.
          </p>
        </div>
      </div>
      <div className="contracts-grid">
        {Object.entries(CONTRACT_TYPES).map(([key, name]) => (
          <button
            key={key}
            className="contract-card"
            onClick={() => {
              /* إطلاق حدث مخصص يلتقطه نموذج الإنشاء ويحدد النوع ويمرّر للأسفل */
              window.dispatchEvent(new CustomEvent("mithaq:pick-type", { detail: key }));
              document
                .getElementById("create")
                ?.scrollIntoView({ behavior: "smooth" });
              onPick?.(key);
            }}
            type="button"
          >
            <div className="contract-icon">
              <i className={`fas ${TYPE_ICONS[key] || "fa-file-contract"}`} />
            </div>
            <div className="contract-name">{name}</div>
            <div className="contract-desc">{TYPE_DESCS[key] || ""}</div>
            <span className={`type-badge ${TYPE_BADGE[key] || "type-other"}`}>
              ابدأ الآن ←
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section className="section features-section" id="features">
      <div className="section-header">
        <div>
          <div className="section-label">مميزاتنا</div>
          <h2 className="section-title">لماذا ميثاق؟</h2>
        </div>
      </div>
      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon green">
            <i className="fas fa-shield-halved" />
          </div>
          <div className="feature-title">أمن وسرية تامة</div>
          <div className="feature-desc">
            عقودك محفوظة في قاعدة بيانات سحابية معزولة، وعزل ملكية صارم — لا
            يمكن لأحد الاطلاع عليها سواك.
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-icon gold">
            <i className="fas fa-bolt" />
          </div>
          <div className="feature-title">سريع وسهل الاستخدام</div>
          <div className="feature-desc">
            أنشئ عقدك الاحترافي في أقل من 5 دقائق دون الحاجة لأي خبرة قانونية
            مسبقة.
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-icon green">
            <i className="fas fa-signature" />
          </div>
          <div className="feature-title">توقيع رقمي بالرسم</div>
          <div className="feature-desc">
            لوحة توقيع تعمل باللمس والفأرة، مع تسجيل IP والوقت لكل توقيع
            للأثبات.
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-icon gold">
            <i className="fas fa-fingerprint" />
          </div>
          <div className="feature-title">بصمة SHA-256 للتحقق</div>
          <div className="feature-desc">
            كل عقد يحمل بصمة رقمية فريدة وصفحة تحقق عامة تكشف أي تعديل بعد
            التوقيع.
          </div>
        </div>
      </div>
    </section>
  );
}

export function MithaqFooter() {
  return (
    <footer className="footer">
      <div>
        <span className="gold">مِــيــثَــاق</span> — منظومة العقود والتوثيق
        الإلكتروني
      </div>
      <div style={{ fontSize: 11, opacity: 0.75 }}>
        عقودك بثقة وسهولة · بصمة SHA-256 · توقيع رقمي · تحقق عام
      </div>
    </footer>
  );
}
