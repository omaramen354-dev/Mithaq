/* أنواع العقود — منقولة من الخادم القديم كما هي */
export const CONTRACT_TYPES: Record<string, string> = {
  lease: "عقد إيجار",
  sale: "بيع وشراء",
  services: "عقد خدمات",
  freelance: "عمل حر",
  pledge: "تعهد وإقرار",
  supply: "عقد توريد",
  partnership: "اتفاق شراكة",
  nda: "اتفاقية سرية",
  lease_commercial: "عقد إيجار تجاري",
  design: "عقد تصميم وبرمجة",
  rent_furnished: "عقد إيجار مفروش",
};

export type ContractTypeKey = keyof typeof CONTRACT_TYPES;

export function contractTypeName(type: string): string {
  return CONTRACT_TYPES[type] || "عقد";
}

/** حالة العقد — المصدر الواحد للحقيقة (قاعدة البيانات) */
export type ContractStatus = "draft" | "partially_signed" | "signed";

export function statusLabel(status: string): string {
  if (status === "signed") return "موقّع من الطرفين";
  if (status === "partially_signed") return "توقيع جزئي";
  return "قيد التوقيع";
}
