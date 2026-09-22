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
