import { contractTypeName } from "./contract-types";
import { contractVerification } from "./fingerprint";

/* رسالة المشاركة الرسمية عبر واتساب — اسم العقد + رابط التوقيع + مرجع التوثيق */

export function whatsappLink(text: string): string {
  return "https://wa.me/?text=" + encodeURIComponent(text);
}

export function buildOfficialShareMessage(
  contract: {
    id: string;
    type: string;
    party1Name: string;
    party2Name: string;
    status: string;
    updatedAt?: string | Date | null;
  },
  link: string
): string {
  const typeName = contractTypeName(contract.type);
  const status =
    contract.status === "signed"
      ? "مُعتمد ومُوقّع رقمياً ✅"
      : "بانتظار التوقيع ⏳";
  const { ref } = contractVerification(
    contract.id,
    contract.updatedAt,
    contract.status
  );
  return [
    "📝 *عقد " + typeName + "* — منصة ميثاق",
    "",
    "الطرف الأول: " + (contract.party1Name || "—"),
    "الطرف الثاني: " + (contract.party2Name || "—"),
    "الحالة: " + status,
    "",
    "🔗 رابط العقد: " + link,
    "",
    "🛡️ مرجع التوثيق: " + ref,
  ].join("\n");
}
