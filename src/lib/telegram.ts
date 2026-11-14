/* إشعارات تيليجرام — تعمل على Vercel عبر fetch مباشرة */

type TgResult = { ok: boolean; description?: string };

/** تهريب HTML — أسماء الأطراف والموقّعين يكتبها المستخدم، ولا يجوز
    أن تُفسَّر كوسوم داخل رسالة تيليجرام (parse_mode: HTML). */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  const typeName = esc(info.typeName);
  const ref = esc(info.ref);
  const party1 = esc(info.party1Name);
  const party2 = esc(info.party2Name);
  const actorName = esc(actor?.name || "");
  const actorParty = esc(actor?.party || "");
  const shareUrl = esc(info.shareUrl);
  const verifyUrl = esc(info.verifyUrl);

  let text: string;
  if (kind === "opened") {
    text = [
      "🔔 <b>العميل فتح العقد الآن</b>",
      "",
      `📄 عقد: ${typeName} — Ref: ${ref}`,
      `👤 الطرف الأول: ${party1}`,
      `👥 الطرف الثاني: ${actorName || party2}`,
      `🕒 ${now}`,
      "",
      `🔗 ${shareUrl}`,
    ].join("\n");
  } else if (kind === "signed") {
    text = [
      "✅ <b>تم اكتمال توقيع العقد بنجاح</b>",
      "",
      `📄 عقد: ${typeName} — Ref: ${ref}`,
      `✍️ وقّع: ${actorName || "الطرفان"} (${actorParty || "—"})`,
      `🕒 ${now}`,
      "",
      `🔗 ${verifyUrl}`,
    ].join("\n");
  } else {
    text = [
      "✍️ <b>توقيع جزئي على العقد</b>",
      "",
      `📄 عقد: ${typeName} — Ref: ${ref}`,
      `✍️ وقّع: ${actorName || "—"} (${actorParty || "—"})`,
      "⏳ بانتظار توقيع الطرف الآخر",
      `🕒 ${now}`,
    ].join("\n");
  }
  return sendTelegramMessage(text);
}

/**
 * إشعار فوري للمشرف على تيليجرام عند كل عملية دفع / شحن (شام كاش أو USDT)
 * يتيح للمشرف المتابعة الفورية أو المراجعة المسائية الكاملة من /admin.
 */
export async function notifyPaymentEvent(info: {
  source: "checkout_instant" | "payment_request" | "usdt_auto_verified";
  planTitle: string;
  planId: string;
  amountUsd: number;
  amountSyp?: number;
  method: string;
  txRef: string;
  phone?: string;
  userName: string;
  userEmail: string;
  adminUrl?: string;
}): Promise<TgResult> {
  const now = new Date().toLocaleString("ar-SY");
  const header =
    info.source === "usdt_auto_verified"
      ? "⚡ <b>دفعة USDT موثّقة تلقائياً من بلوكشين TRON!</b>"
      : info.source === "checkout_instant"
        ? "💳 <b>عملية شحن شام كاش جديدة (تفعيل فوري بانتظار مراجعتك)</b>"
        : "🧾 <b>طلب دفع جديد بانتظار المراجعة</b>";

  const lines = [
    header,
    "",
    `📦 الباقة: <b>${esc(info.planTitle)}</b> (${esc(info.planId)})`,
    `💵 القيمة: ${esc(info.amountUsd)} USDT${info.amountSyp ? ` (${esc(info.amountSyp.toLocaleString("en-US"))} ل.س)` : ""}`,
    `🏦 الطريقة: ${esc(info.method)}`,
    `🔢 رقم العملية: <code>${esc(info.txRef)}</code>`,
    ...(info.phone ? [`📞 الهاتف: <code>${esc(info.phone)}</code>`] : []),
    `👤 المستخدم: ${esc(info.userName || "—")} (${esc(info.userEmail || "—")})`,
    `🕒 ${now}`,
  ];

  if (info.adminUrl) {
    lines.push("", `🔎 للمراجعة (تأكيد أو تجميد): ${esc(info.adminUrl)}`);
  }

  return sendTelegramMessage(lines.join("\n"));
}
