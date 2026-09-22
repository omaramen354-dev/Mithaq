/* إشعارات تيليجرام — تعمل على Vercel عبر fetch مباشرة */

type TgResult = { ok: boolean; description?: string };

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(text: string): Promise<TgResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, description: "not configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as TgResult;
    return data;
  } catch (error) {
    return { ok: false, description: (error as Error).message };
  }
}

export async function notifyContractEvent(
  info: {
    typeName: string;
    ref: string;
    party1Name: string;
    party2Name: string;
    shareUrl: string;
    verifyUrl: string;
  },
  kind: "opened" | "signed" | "signing",
  actor?: { name?: string; party?: string }
): Promise<TgResult> {
  const now = new Date().toLocaleString("ar-SY");
  let text: string;
  if (kind === "opened") {
    text = [
      "🔔 *العميل فتح العقد الآن*",
      "",
      `📄 عقد: ${info.typeName} — Ref: ${info.ref}`,
      `👤 الطرف الأول: ${info.party1Name}`,
      `👥 الطرف الثاني: ${actor?.name || info.party2Name}`,
      `🕒 ${now}`,
      "",
      `🔗 ${info.shareUrl}`,
    ].join("\n");
  } else if (kind === "signed") {
    text = [
      "✅ *تم اكتمال توقيع العقد بنجاح*",
      "",
      `📄 عقد: ${info.typeName} — Ref: ${info.ref}`,
      `✍️ وقّع: ${actor?.name || "الطرفان"} (${actor?.party || "—"})`,
      `🕒 ${now}`,
      "",
      `🔗 ${info.verifyUrl}`,
    ].join("\n");
  } else {
    text = [
      "✍️ *توقيع جزئي على العقد*",
      "",
      `📄 عقد: ${info.typeName} — Ref: ${info.ref}`,
      `✍️ وقّع: ${actor?.name || "—"} (${actor?.party || "—"})`,
      "⏳ بانتظار توقيع الطرف الآخر",
      `🕒 ${now}`,
    ].join("\n");
  }
  return sendTelegramMessage(text);
}
