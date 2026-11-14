import { arDate } from "./format";
import { DEFAULT_CLAUSES } from "./clauses";
import { contractTypeName } from "./contract-types";

/* ============================================================
   بناء نص العقد وتعبئة الحقول الديناميكية
   كل نص بين [قوسين] يُستبدل من بيانات العقد
   ============================================================ */

export function normalize(value: unknown): string {
  let s = String(value == null ? "" : value).trim();
  /* إزالة BOM في أي موضع + أحرف التحكم + كل أحرف التوجيه المخفية
     (Bidi Overrides/Isolates, ALM, ZWSP/ZWNJ/ZWJ, Line/Paragraph Separators)
     لمنع هجمات Trojan Source وتزييف اتجاه النص في العقود */
  s = s
    .replace(/\uFFFD/g, " ")
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u061C\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g,
      ""
    );
  return s.replace(/\s{2,}/g, " ").trim();
}

/* ============================================================
   حدود الحقول — خط الدفاع الأول ضد تضخيم قاعدة البيانات
   تُطبَّق على كل مسار كتابة (إنشاء / تعديل / استعادة / توقيع).
   ============================================================ */
export const CONTRACT_LIMITS = {
  partyName: 120,
  amount: 60,
  city: 80,
  country: 80,
  subject: 300,
  duration: 80,
  paymentMethod: 80,
  notes: 2000,
  clause: 2000,
  maxClauses: 40,
  /** الحد الأقصى لحجم جسم الطلب (بايت) — يمنع رفع مسودات ضخمة */
  maxBodyBytes: 250_000,
} as const;

/** قصّ نص بعد التطبيع إلى حد أقصى */
export function clampText(value: unknown, max: number): string {
  return normalize(value).slice(0, max);
}

/** قصّ مصفوفة البنود وحدود كل بند */
export function clampClauses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, CONTRACT_LIMITS.maxClauses)
    .map((c) => clampText(c, CONTRACT_LIMITS.clause))
    .filter(Boolean);
}

/** فحص مبدئي لترويسة Content-Length (مع رفض القيم الشاذة والسالبة والترميز المجزأ بلا حد) */
export function isBodyTooLarge(
  req: Request,
  maxBytes: number = CONTRACT_LIMITS.maxBodyBytes
): boolean {
  const te = req.headers.get("transfer-encoding");
  const raw = req.headers.get("content-length");

  if (raw !== null) {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return true;
    const size = Number(trimmed);
    return !Number.isFinite(size) || size < 0 || size > maxBytes;
  }

  /* في الطلبات ذات الجسم (POST/PUT/PATCH) عند غياب Content-Length أو وجود chunked
     لا يُسمح بالتمرير الأعمى عبر هذا الفحص فقط — يجب استخدام readBoundedJson،
     كما نرفضه هنا لحماية المتصلين الذين يعتمدون على isBodyTooLarge وحدها */
  if (te && /chunked/i.test(te)) return true;
  const method = (req.method || "GET").toUpperCase();
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    return true;
  }
  return false;
}

/**
 * قراءة آمنة ومحدودة الحجم لجسم JSON الفعلي (تحمي ضد Chunked Transfer وتزوير Content-Length).
 * تقرأ الدفق بايت-ببايت وتقطع القراءة فوراً عند تجاوز maxBytes.
 */
export async function readBoundedJson<T = Record<string, unknown>>(
  req: Request,
  maxBytes: number = CONTRACT_LIMITS.maxBodyBytes
): Promise<
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; message: string }
> {
  const rawLen = req.headers.get("content-length");
  if (rawLen !== null) {
    const trimmed = rawLen.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, status: 400, message: "ترويسة Content-Length غير صالحة." };
    }
    if (Number(trimmed) > maxBytes) {
      return { ok: false, status: 413, message: "حجم البيانات أكبر من الحد المسموح." };
    }
  }

  let rawText = "";
  try {
    if (req.body) {
      const reader = req.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            return {
              ok: false,
              status: 413,
              message: "حجم البيانات أكبر من الحد المسموح.",
            };
          }
          chunks.push(value);
        }
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const ch of chunks) {
        merged.set(ch, offset);
        offset += ch.byteLength;
      }
      rawText = new TextDecoder("utf-8").decode(merged);
    } else {
      rawText = await req.text();
      if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
        return {
          ok: false,
          status: 413,
          message: "حجم البيانات أكبر من الحد المسموح.",
        };
      }
    }
  } catch {
    return { ok: false, status: 400, message: "تعذّرت قراءة جسم الطلب." };
  }

  if (!rawText.trim()) {
    return { ok: false, status: 400, message: "بيانات غير صالحة." };
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, message: "بيانات JSON غير صالحة." };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, status: 400, message: "صيغة JSON غير صالحة." };
  }
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
  const amount = c.amount || "المبلغ المتفق عليه";
  const scope = c.subject || "الموضوع المبيّن في هذا العقد";
  const delivery = c.duration || "المدة المتفق عليها";
  const payment = c.paymentMethod || "الطريقة المتفق عليها";
  const city = c.city || "المدينة المختصة";
  const dateStr = arDate(c.date);
  return {
    "اسم مقدم الخدمة": c.party2Name,
    "اسم طالب الخدمة": c.party1Name,
    "اسم المستقل": c.party2Name,
    "اسم المصمم/المبرمج": c.party2Name,
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
    "غرض الشراكة/النشاط": scope,
    "موضوع العلاقة/المشروع": scope,
    "الغرض المحدد من الإفصاح": scope,
    "نطاق العمل": scope,
    "المقابل المالي/القيمة": amount,
    "المقابل المالي": amount,
    "القيمة المادية": amount,
    "القيمة/المبلغ": amount,
    "المبلغ": amount,
    "مدة التنفيذ/التسليم": delivery,
    "مدة التنفيذ": delivery,
    "تاريخ/مدة التسليم": delivery,
    "تاريخ/جدول التسليم": delivery,
    "تاريخ التسليم": delivery,
    "مدة العقد": delivery,
    "المدة الزمنية": delivery,
    "عدد الأيام": "15",
    "مدة الفحص": "7 أيام",
    "مدة المعالجة": "7 أيام",
    "مدة الإخطار": "30 يوماً",
    "مدة السرية": "سنتين",
    "عدد التعديلات": "جولتي تعديل",
    "طريقة السداد": payment,
    "آلية السداد": payment,
    "المدينة/الدولة": city,
    "مكان التسليم": city,
    "تاريخ البداية": dateStr,
    "تاريخ النهاية": delivery,
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
  const defaults = Object.hasOwn(DEFAULT_CLAUSES, c.type)
    ? DEFAULT_CLAUSES[c.type]
    : [];
  const source = c.clauses && c.clauses.length ? c.clauses : defaults;
  return source.map((cl) => applyPlaceholders(cl, map));
}

export function buildContractContent(c: ContractData): string {
  const typeName = contractTypeName(c.type);
  const lines: string[] = [];
  lines.push("بسم الله الرحمن الرحيم", "", typeName, "");
  lines.push(
    `حُرّر هذا العقد في ${c.city ? c.city + "، " : ""}بتاريخ ${arDate(c.date)} بين:`
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
