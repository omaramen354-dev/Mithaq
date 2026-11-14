/* أنواع العقود — منقولة من الخادم القديم كما هي
   نستخدم Object.create(null) لمنع وصول Prototype Lookup مثل constructor/toString/__proto__ */
export const CONTRACT_TYPES: Record<string, string> = Object.assign(
  Object.create(null),
  {
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
  }
);

export type ContractTypeKey =
  | "lease"
  | "sale"
  | "services"
  | "freelance"
  | "pledge"
  | "supply"
  | "partnership"
  | "nda"
  | "lease_commercial"
  | "design"
  | "rent_furnished";

/** فحص صارم باستخدام Object.hasOwn يمنع استغلال خصائص Object.prototype */
export function isValidContractType(type: unknown): type is ContractTypeKey {
  return typeof type === "string" && Object.hasOwn(CONTRACT_TYPES, type);
}

export function contractTypeName(type: string): string {
  return Object.hasOwn(CONTRACT_TYPES, type) ? CONTRACT_TYPES[type] : "عقد";
}

/** حالة العقد — المصدر الواحد للحقيقة (قاعدة البيانات) */
export type ContractStatus = "draft" | "partially_signed" | "signed";

export function statusLabel(status: string): string {
  if (status === "signed") return "موقّع من الطرفين";
  if (status === "partially_signed") return "توقيع جزئي";
  return "قيد التوقيع";
}
