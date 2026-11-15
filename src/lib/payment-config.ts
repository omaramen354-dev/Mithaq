/* ============================================================
   payment-config.ts — المصدر الموحد لبيانات الدفع والدعم (Server Runtime)
   يقرأ متغيرات البيئة حيّاً من الخادم (مع دعم الأسماء الرسمية NEXT_PUBLIC_*
   والأسماء البديلة دون البادئة إن ضُبطت في Vercel) بحيث لا تتعطل
   صفحات /pricing أو /checkout بسبب Build Cache أو اختلاف البادئة.
   ============================================================ */

export type PublicPaymentConfig = {
  usdtWallet: string;
  usdtReady: boolean;
  shamAccount: string;
  shamName: string;
  shamReady: boolean;
  supportWhatsapp: string;
  whatsappReady: boolean;
  anyMethodReady: boolean;
};

export function getPaymentConfig(): PublicPaymentConfig {
  const usdtWallet = (
    process.env.NEXT_PUBLIC_USDT_TRC20_ADDRESS ||
    process.env.USDT_TRC20_ADDRESS ||
    ""
  ).trim();

  const shamAccount = (
    process.env.NEXT_PUBLIC_SHAM_CASH_ACCOUNT ||
    process.env.SHAM_CASH_ACCOUNT ||
    ""
  ).trim();

  const shamName = (
    process.env.NEXT_PUBLIC_SHAM_CASH_NAME ||
    process.env.SHAM_CASH_NAME ||
    ""
  ).trim();

  const supportWhatsapp = (
    process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ||
    process.env.SUPPORT_WHATSAPP ||
    ""
  ).trim();

  const usdtReady = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(usdtWallet);
  /* معرّف شام كاش قد يكون رقماً أو رمزاً أبجدياً رقمياً — نقبل أي معرّف ≥ 4 خانات مع اسم ≥ حرفين */
  const shamReady = shamAccount.length >= 4 && shamName.length >= 2;
  const waDigits = supportWhatsapp.replace(/\D/g, "");
  const whatsappReady = waDigits.length >= 8 && waDigits.length <= 16;

  return {
    usdtWallet,
    usdtReady,
    shamAccount,
    shamName,
    shamReady,
    supportWhatsapp,
    whatsappReady,
    anyMethodReady: usdtReady || shamReady,
  };
}
