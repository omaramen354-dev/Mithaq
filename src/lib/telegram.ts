/* إشعارات وأزرار تيليجرام التفاعلية — تعمل على Vercel عبر fetch مباشرة */

import { createHmac, timingSafeEqual } from "crypto";

type TgResult = { ok: boolean; description?: string };

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

/** تهريب HTML — أسماء الأطراف والموقّعين يكتبها المستخدم، ولا يجوز
    أن تُفسَّر كوسوم داخل رسالة تيليجرام (parse_mode: HTML). */
export function escTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const esc = escTelegramHtml;

export function telegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_CHAT_ID?.trim()
  );
}

/**
 * سر التحقق من Webhook تيليجرام (X-Telegram-Bot-Api-Secret-Token):
 * يُستخدم TELEGRAM_WEBHOOK_SECRET إن ضُبط صراحةً، وإلا يُشتق حتمياً عبر
 * HMAC-SHA256 من TELEGRAM_BOT_TOKEN (64 خانة هكس) دون الحاجة لأي متغير إضافي.
 */
export function getTelegramWebhookSecret(): string {
  const explicit = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (explicit.length >= 16) return explicit;
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return "";
  return createHmac("sha256", token)
    .update("mithaq-tg-webhook-v1")
    .digest("hex");
}

/** مقارنة آمنة بزمن ثابت لترويسة X-Telegram-Bot-Api-Secret-Token */
export function verifyTelegramWebhookSecret(headerValue: string | null): boolean {
  const expected = getTelegramWebhookSecret();
  if (!expected || !headerValue) return false;
  const a = Buffer.from(headerValue.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** تسجيل عنوان Webhook تيليجرام تلقائياً لاستقبال نقرات أزرار التأكيد/التجميد */
export async function registerTelegramWebhook(
  baseUrl: string
): Promise<TgResult & { url?: string }> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const secret = getTelegramWebhookSecret();
  if (!token || !secret) {
    return { ok: false, description: "not configured" };
  }
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  if (!cleanBase.startsWith("https://")) {
    return { ok: false, description: "webhook requires https base url" };
  }
  const webhookUrl = `${cleanBase}/api/telegram/webhook`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["callback_query"],
        drop_pending_updates: false,
      }),
    });
    const data = (await res.json()) as TgResult;
    return { ...data, url: webhookUrl };
  } catch (error) {
    return { ok: false, description: (error as Error).message, url: webhookUrl };
  }
}

export async function sendTelegramMessage(
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<TgResult> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return { ok: false, description: "not configured" };
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as TgResult;
    return data;
  } catch (error) {
    return { ok: false, description: (error as Error).message };
  }
}

export async function answerTelegramCallback(
  callbackQueryId: string,
  text: string,
  showAlert = false
): Promise<TgResult> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token || !callbackQueryId) return { ok: false, description: "not configured" };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text.slice(0, 190),
          show_alert: showAlert,
        }),
      }
    );
    return (await res.json()) as TgResult;
  } catch (error) {
    return { ok: false, description: (error as Error).message };
  }
}

export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<TgResult> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, description: "not configured" };
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const res = await fetch(
      `https://api.telegram.org/bot${token}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    return (await res.json()) as TgResult;
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
 * يرفق أزرار تفاعلية مباشرة (✅ تأكيد الحوالة / ❄️ تجميد الحساب) للمراجعة
 * المسائية الفورية من داخل تيليجرام دون الحاجة لفتح لوحة الأدمن.
 */
export async function notifyPaymentEvent(info: {
  source:
    | "checkout_instant"
    | "usdt_instant"
    | "payment_request"
    | "usdt_auto_verified";
  recordKind?: "tx" | "pr";
  recordId?: string;
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
        : info.source === "usdt_instant"
          ? "🪙 <b>دفعة USDT (TRC20) جديدة (تفعيل فوري بانتظار مراجعتك المسائية)</b>"
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

  const cleanAdminUrl = (info.adminUrl || "").trim();
  const hasHttpsAdmin = cleanAdminUrl.startsWith("https://");

  /* أزرار تفاعلية مباشرة: تأكيد أو تجميد بضغطة واحدة داخل تيليجرام */
  let replyMarkup: InlineKeyboardMarkup | undefined;
  if (
    info.recordKind &&
    info.recordId &&
    info.source !== "usdt_auto_verified"
  ) {
    const confirmCode =
      info.recordKind === "tx"
        ? `tx:v:${info.recordId}`
        : `pr:a:${info.recordId}`;
    const freezeCode =
      info.recordKind === "tx"
        ? `tx:s:${info.recordId}`
        : `pr:f:${info.recordId}`;

    const rows: InlineKeyboardButton[][] = [
      [
        { text: "✅ تأكيد الحوالة", callback_data: confirmCode },
        { text: "❄️ تجميد الحساب", callback_data: freezeCode },
      ],
    ];
    if (hasHttpsAdmin) {
      rows.push([{ text: "🔗 فتح لوحة الأدمن", url: cleanAdminUrl }]);
    }
    replyMarkup = { inline_keyboard: rows };
  } else if (cleanAdminUrl) {
    lines.push("", `🔎 لوحة القيادة: ${esc(cleanAdminUrl)}`);
  }

  return sendTelegramMessage(lines.join("\n"), replyMarkup);
}

/**
 * إشعار فوري للمشرف على تيليجرام عند وقوع خطأ فعلي في المنصة (متصفح أو خادم).
 * يُستدعى مع حماية ضد التكرار والإغراق من /api/errors.
 */
export async function notifyErrorEvent(info: {
  source: "browser" | "server";
  message: string;
  component?: string;
  url?: string;
  userName?: string;
  userEmail?: string;
  adminUrl?: string;
}): Promise<TgResult> {
  const now = new Date().toLocaleString("ar-SY");
  const title =
    info.source === "server"
      ? "🔥 <b>خطأ خادم فوري — منصة ميثاق</b>"
      : "🚨 <b>تنبيه خطأ فوري — منصة ميثاق</b>";

  const who =
    info.userName || info.userEmail
      ? `${esc(info.userName || "مستخدم")} (${esc(info.userEmail || "—")})`
      : "زائر غير مسجّل";

  const lines = [
    title,
    "",
    `⚠️ الرسالة: <code>${esc(info.message.slice(0, 350))}</code>`,
    ...(info.component ? [`🧩 المكوّن: ${esc(info.component)}`] : []),
    ...(info.url ? [`🌐 الصفحة: ${esc(info.url.slice(0, 220))}`] : []),
    `👤 المستخدم: ${who}`,
    `🕒 ${now}`,
  ];

  const cleanAdminUrl = (info.adminUrl || "").trim();
  if (cleanAdminUrl) {
    lines.push("", `🔎 سجل الأخطاء في لوحة القيادة: ${esc(cleanAdminUrl)}`);
  }

  return sendTelegramMessage(lines.join("\n"));
}
