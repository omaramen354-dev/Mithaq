import { createHash } from "crypto";

/* ============================================================
   contract-hash.ts — بصمة العقد الرقمية (خادم فقط)
   تستخدم ترميز JSON قياسي (Canonical Framing) لمنع تصادم الفواصل
   وتربط النص والبنود وهويات الموقّعين وصور التوقيع وأوقاتها معاً.
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
  signingMode?: string | null;
  party2Email?: string | null;
  party2GoogleId?: string | null;
  status?: string | null;
  sig1Name?: string | null;
  sig1DataUrl?: string | null;
  sig1SignedAt?: string | Date | null;
  sig2Name?: string | null;
  sig2DataUrl?: string | null;
  sig2SignedAt?: string | Date | null;
};

function normDate(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v);
}

export function contractFingerprint(c: FingerprintInput): string {
  const payload = JSON.stringify([
    "mithaq:fp:v2",
    c.id || "",
    c.type || "",
    c.party1Name || "",
    c.party2Name || "",
    c.amount || "",
    normDate(c.date),
    c.duration || "",
    c.paymentMethod || "",
    c.city || "",
    c.subject || "",
    c.notes || "",
    Array.isArray(c.clauses) ? c.clauses.map((cl) => String(cl ?? "")) : [],
    c.content || "",
    c.signingMode || "",
    (c.party2Email || "").toLowerCase(),
    c.party2GoogleId || "",
    c.status || "",
    c.sig1Name || "",
    c.sig1DataUrl || "",
    normDate(c.sig1SignedAt),
    c.sig2Name || "",
    c.sig2DataUrl || "",
    normDate(c.sig2SignedAt),
  ]);

  return createHash("sha256").update(payload, "utf8").digest("hex");
}
