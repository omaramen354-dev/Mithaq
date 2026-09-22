import { createHash } from "crypto";

/* ============================================================
   بصمة العقد الرقمية (SHA-256) — أي تغيير حرف واحد يغيّرها بالكامل
   تُختم عند الإنشاء/التوقيع وتُقارن في صفحة /verify لكشف التلاعب
   ============================================================ */

export type FingerprintInput = {
  id: string;
  type: string;
  party1Name: string;
  party2Name: string;
  amount?: string | null;
  date: string | Date;
  duration?: string | null;
  paymentMethod?: string | null;
  city?: string | null;
  subject?: string | null;
  notes?: string | null;
  clauses?: string[];
  content?: string;
};

export function contractFingerprint(c: FingerprintInput): string {
  return createHash("sha256")
    .update(
      [
        c.id || "",
        c.type || "",
        c.party1Name || "",
        c.party2Name || "",
        c.amount || "",
        c.date instanceof Date ? c.date.toISOString() : c.date || "",
        c.duration || "",
        c.paymentMethod || "",
        c.city || "",
        c.subject || "",
        c.notes || "",
        (c.clauses || []).join("\n"),
        c.content || "",
      ].join("|")
    )
    .digest("hex");
}

/* مرجع التوثيق الحتمي (MEQ-XXXXX) + رمز تحقق قصير — ثابت لكل عقد */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function contractVerification(
  id: string,
  updatedAt?: string | Date | null,
  status?: string | null
): { ref: string; verify: string } {
  const updated =
    updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt || "";
  const refSeed = hashString(id || "");
  const verifySeed = hashString((id || "") + "|" + updated + "|" + (status || ""));
  return {
    ref: "MEQ-" + String(refSeed % 100000).padStart(5, "0"),
    verify: (verifySeed >>> 0).toString(16).toUpperCase().padStart(8, "0"),
  };
}

/* رابط المشاركة العام — من BASE_URL أو من الطلب نفسه */
export function shareUrlFor(id: string, baseUrl?: string): string {
  const base = (baseUrl || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return base + "/share/" + encodeURIComponent(id);
}

export function verifyPathFor(id: string): string {
  return "/verify/" + encodeURIComponent(id);
}
