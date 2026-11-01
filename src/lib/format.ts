/* تنسيق التواريخ بالعربية — يعمل في الخادم والعميل */

export function arDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleDateString("ar-SY", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function arDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString("ar-SY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

/* إخفاء جزء من البريد للعرض العام: a***@gmail.com
   (حماية خصوصية المُوقِّع على صفحة التحقق التي يفتحها أي ماسح باركود) */
export function maskEmail(value: string | null | undefined): string {
  const email = (value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return email ? "—" : "";
  const [local, domain] = email.split("@");
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}

export function formatDateForDocument(
  value: string | Date | null | undefined
): string {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleDateString("ar-SY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
