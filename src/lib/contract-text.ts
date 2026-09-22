import { arDate } from "./format";
import { DEFAULT_CLAUSES } from "./clauses";
import { contractTypeName } from "./contract-types";

/* ============================================================
   بناء نص العقد وتعبئة الحقول الديناميكية
   كل نص بين [قوسين] يُستبدل من بيانات العقد
   ============================================================ */

export function normalize(value: unknown): string {
  let s = String(value == null ? "" : value).trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s
    .replace(/\uFFFD/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E]/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

export type ContractData = {
  type: string;
  party1Name: string;
  party2Name: string;
  amount?: string | null;
  city?: string | null;
  subject?: string | null;
  duration?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  clauses?: string[];
  date: string | Date;
  sig1Name?: string | null;
  sig2Name?: string | null;
};

function placeholderMap(c: ContractData): Record<string, string> {
  const amount = c.amount || "";
  const scope = c.subject || "";
  const delivery = c.duration || "";
  const dateStr = arDate(c.date);
  return {
    "اسم مقدم الخدمة": c.party2Name,
    "اسم طالب الخدمة": c.party1Name,
    "اسم المستقل": c.party2Name,
    "اسم العميل": c.party1Name,
    "اسم البائع": c.party1Name,
    "اسم المشتري": c.party2Name,
    "اسم المؤجر": c.party1Name,
    "اسم المستأجر": c.party2Name,
    "الطرف الأول": c.party1Name,
    "الطرف الثاني": c.party2Name,
    "اسم المقر/المتعهد": c.party1Name,
    "اسم المستفيد": c.party2Name,
    "اسم المورد": c.party1Name,
    "أسماء الشركاء": [c.party1Name, c.party2Name].filter(Boolean).join(" و"),
    "وصف الخدمة": scope,
    "وصف الخدمة/المشروع": scope,
    "وصف المشروع/الخدمة": scope,
    "وصف المشروع": scope,
    "وصف المبيع وصفاً نافياً للجهالة": scope,
    "وصف التعهد أو الإقرار": scope,
    "وصف البضائع/المواد": scope,
    "نطاق العمل": scope,
    "المقابل المالي/القيمة": amount,
    "المقابل المالي": amount,
    "القيمة المادية": amount,
    "القيمة/المبلغ": amount,
    "المبلغ": amount,
    "مدة التنفيذ/التسليم": delivery,
    "مدة التنفيذ": delivery,
    "تاريخ/مدة التسليم": delivery,
    "تاريخ التسليم": delivery,
    "مدة العقد": delivery,
    "المدة الزمنية": delivery,
    "عدد الأيام": "15",
    "عدد التعديلات": "جلستين تعديل",
    "طريقة السداد": c.paymentMethod || "دفعة واحدة",
    "آلية السداد": c.paymentMethod || "دفعة واحدة",
    "المدينة/الدولة": c.city || "",
    "تاريخ البداية": dateStr,
    "تاريخ النهاية": dateStr,
    "عنوان العقار": scope,
    "الغرض من الإيجار": scope,
  };
}

export function applyPlaceholders(
  text: string,
  map: Record<string, string>
): string {
  let out = String(text || "");
  for (const [key, value] of Object.entries(map)) {
    if (!value) continue;
    out = out.split("[" + key + "]").join(value);
  }
  return out.replace(/\[([^\]]{1,80})\]/g, (m, inner: string) => {
    const t = inner.trim();
    for (const [key, value] of Object.entries(map)) {
      if (value && t.includes(key)) return value;
    }
    return "—";
  });
}

export function resolveClauses(c: ContractData): string[] {
  const map = placeholderMap(c);
  return (c.clauses && c.clauses.length ? c.clauses : DEFAULT_CLAUSES[c.type] || []).map(
    (cl) => applyPlaceholders(cl, map)
  );
}

export function buildContractContent(c: ContractData): string {
  const typeName = contractTypeName(c.type);
  const lines: string[] = [];
  lines.push("بسم الله الرحمن الرحيم", "", typeName, "");
  lines.push(
    `حرر هذا العقد في ${c.city ? c.city + "، " : ""}بتاريخ ${arDate(c.date)} بين:`
  );
  lines.push(`الطرف الأول: ${c.party1Name}`);
  lines.push(`الطرف الثاني: ${c.party2Name}`);
  if (c.subject) lines.push(`موضوع العقد: ${c.subject}`);
  if (c.amount) lines.push(`القيمة/المبلغ: ${c.amount}`);
  if (c.duration) lines.push(`مدة العقد: ${c.duration}`);
  if (c.paymentMethod) lines.push(`طريقة السداد: ${c.paymentMethod}`);
  lines.push("", "البنود:");
  resolveClauses(c).forEach((clause, i) => lines.push(`${i + 1}. ${clause}`));
  lines.push("");
  if (c.notes) lines.push(`ملاحظات إضافية: ${c.notes}`, "");
  lines.push(
    "يقر الطرفان بأنهما اطلعا على بنود هذا العقد وفهما مضمونه وقبلا الالتزام به.",
    ""
  );
  lines.push(`توقيع الطرف الأول: ${c.sig1Name || "____________________"}`);
  lines.push(`توقيع الطرف الثاني: ${c.sig2Name || "____________________"}`);
  return lines.join("\n");
}
