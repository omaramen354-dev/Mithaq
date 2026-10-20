import { createHash } from "crypto";

/* ============================================================
   contract-hash.ts — بصمة العقد الرقمية (خادم فقط)
   منفصلة عن fingerprint.ts كي لا يدخل crypto في حزمة المتصفح
   (جدول العقود عميل ويستورد دوال العرض النقية فقط).
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
