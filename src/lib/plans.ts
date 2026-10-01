/* ============================================================
   plans.ts — باقات ميثاق واشتراكاتها
   نفس باقات النسخة الأصلية (أساسي/موثّق/مستقل/مكاتب + مراجعة
   قانونية) + باقة جديدة: العقد الواحد. كل الأسعار بـ USDT مع
   مقابل بالليرة السورية للدفع عبر شام كاش.
   التفعيل يدوي: المستخدم يرسل إثبات الدفع من /pricing ويدخل
   الطلب إلى جدول payment_requests، ويؤكده المشرف من /admin
   فيُفعَّل plan وplanExpiresAt في حسابه.
   ============================================================ */

export type PlanUnit = "once" | "month";

export type Plan = {
  id: string;
  title: string;
  icon: string; // أيقونة Font Awesome
  priceUsd: number; // سعر USDT (0 = مجاني)
  priceSyp: number; // المقابل بالليرة (تُحدَّث دورياً)
  unit: PlanUnit; // once = دفعة واحدة | month = شهري
  tagline: string;
  features: string[];
  popular?: boolean; // باقة مميزة بصرياً
  service?: boolean; // خدمة غير اشتراك (مراجعة قانونية) — لا تفعّل plan
};

export const PLANS: Plan[] = [
  {
    id: "free",
    title: "Freemium",
    icon: "fa-file-lines",
    priceUsd: 0,
    priceSyp: 0,
    unit: "once",
    tagline: "ابدأ بدون عوائق: إنشاء العقد وتجربة القوالب الأساسية.",
    features: ["إنشاء 3 عقود شهرياً", "تعديل البنود", "معاينة العقد", "مشاركة نصية"],
  },
  {
    id: "single",
    title: "العقد الواحد",
    icon: "fa-file-circle-check",
    priceUsd: 2,
    priceSyp: 30000,
    unit: "once",
    tagline: "عقد واحد كامل المزايا — تدفع مرة واحدة لما تحتاجه فقط.",
    features: ["عقد واحد PDF احترافي", "رابط مشاركة وتوقيع", "حفظ دائم في الأرشيف"],
  },
  {
    id: "basic",
    title: "أساسي",
    icon: "fa-file-contract",
    priceUsd: 5,
    priceSyp: 75000,
    unit: "once",
    tagline: "7 عقود شهرياً بجودة احترافية — تدفع مرة واحدة.",
    features: ["7 عقود شهرياً", "PDF احترافي", "رابط مشاركة", "حفظ دائم"],
  },
  {
    id: "verified",
    title: "موثّق",
    icon: "fa-stamp",
    priceUsd: 9,
    priceSyp: 135000,
    unit: "once",
    tagline: "أفضل باقة فردية: PDF، توقيع، مشاركة وختم ميثاق.",
    features: ["كل مزايا أساسي", "توقيع رقمي", "ختم ميثاق", "أولوية في التحسينات"],
    popular: true,
  },
  {
    id: "freelancer",
    title: "المستقل",
    icon: "fa-laptop-code",
    priceUsd: 15,
    priceSyp: 225000,
    unit: "month",
    tagline: "للمستقلين الذين يحتاجون عقوداً متكررة مع العملاء.",
    features: ["عقود غير محدودة شهرياً", "PDF وتوقيع", "قوالب خدمات وعمل حر", "أرشفة"],
  },
  {
    id: "office",
    title: "المكاتب",
    icon: "fa-briefcase",
    priceUsd: 49,
    priceSyp: 735000,
    unit: "month",
    tagline: "لمكاتب الخدمات والعقارية التي تحتاج إنتاج عقود متكرر.",
    features: ["عقود غير محدودة شهرياً", "قوالب متعددة", "أرشفة وبحث", "دعم أسرع"],
  },
  {
    id: "legal_review",
    title: "مراجعة قانونية",
    icon: "fa-scale-balanced",
    priceUsd: 25,
    priceSyp: 375000,
    unit: "once",
    tagline: "مراجعة بنود العقد مع ملاحظات وتعديلات مقترحة.",
    features: ["مراجعة البنود", "ملاحظات قانونية", "تعديلات مقترحة"],
    service: true,
  },
];

export function findPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/* الباقات القابلة للشراء (بدون المجاني) — تُعرض في صفحة الأسعار */
export const PAID_PLANS = PLANS.filter((p) => p.id !== "free");

export function priceLabel(p: Plan): string {
  if (p.priceUsd === 0) return "مجاني";
  const base = `${p.priceUsd} USDT`;
  return p.unit === "month" ? `${base} / شهر` : base;
}

export function priceLabelSyp(p: Plan): string {
  if (p.priceSyp === 0) return "مجاني";
  const base = `${p.priceSyp.toLocaleString("en-US")} ل.س`;
  return p.unit === "month" ? `${base} / شهر` : base;
}

/* مدد التفعيل بالأيام — إشتراك شهر كامل */
export const MONTH_DAYS = 30;

/* الحدود الشهرية لكل باقة — يُطبقها الخادم عند إنشاء العقد
   null = بلا حد (الموثّقة دفعة واحدة، والمستقل/المكاتب طوال
   فاعلية الاشتراك الشهري، والعقد الواحد تُدار عبر isSingleUsed) */
export const PLAN_LIMITS: Record<string, number | null> = {
  free: 3, // 3 عقود شهرياً
  single: null, // عقد واحد (تُدار عبر isSingleUsed)
  basic: 7, // 7 عقود شهرياً
  verified: null, // غير محدود
  freelancer: null, // غير محدود طوال الاشتراك
  office: null, // غير محدود طوال الاشتراك
};
