/* ============================================================
   مسودة الضيف (Guest Draft) — حفظ واستعادة عبر LocalStorage

   الضيف يبني عقداً كاملاً في الصفحة الرئيسية دون تسجيل دخول.
   عند "حفظ في قاعدة البيانات" أو "طباعة PDF" نحفظ المسودة محلياً
   ونطلب تسجيل الدخول؛ بعد عودته من Google يستعيد النموذج بياناته
   تلقائياً ويحفظها فوراً في Neon عبر POST /api/contracts/restore.
   ============================================================ */

export type GuestDraft = {
  type: string;
  signingMode: string;
  party1: string;
  party2: string;
  amount: string;
  city: string;
  country: string;
  subject: string;
  duration: string;
  paymentMethod: string;
  notes: string;
  clauses: string[];
  savedAt: number;
};

const KEY = "mithaq.guestDraft.v1";
const CLAIM_FLAG = "mithaq.guestClaim.v1";

export function saveGuestDraft(d: Omit<GuestDraft, "savedAt">): void {
  try {
    const draft: GuestDraft = { ...d, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* التخزين المحلي معطل (وضع خاص) — نتجاهل بهدوء */
  }
}

export function loadGuestDraft(): GuestDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as GuestDraft;
    /* صلاحية المسودة 7 أيام */
    if (!d || Date.now() - (d.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
      clearGuestDraft();
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function clearGuestDraft(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(CLAIM_FLAG);
  } catch {
    /* تجاهل */
  }
}

/** وسم أن هناك مسودة بانتظار الاستعادة (يُقرأ في صفحة /login) */
export function markPendingClaim(): void {
  try {
    localStorage.setItem(CLAIM_FLAG, String(Date.now()));
  } catch {
    /* تجاهل */
  }
}

export function hasPendingClaim(): boolean {
  try {
    return Boolean(localStorage.getItem(CLAIM_FLAG));
  } catch {
    return false;
  }
}
