import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/client-ip";
import { readBoundedJson } from "@/lib/contract-text";
import {
  answerTelegramCallback,
  editTelegramMessage,
  escTelegramHtml,
  telegramConfigured,
  verifyTelegramWebhookSecret,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
} from "@/lib/telegram";
import {
  decidePaymentRequest,
  decideTransaction,
  type DecisionActor,
} from "@/lib/payment-decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/telegram/webhook
   يستقبل نقرات الأزرار التفاعلية (✅ تأكيد الحوالة / ❄️ تجميد الحساب / 🔓 فك التجميد)
   مباشرة من محادثة المشرف في تيليجرام.

   طبقات الحماية:
   1. التحقق بزمن ثابت (timingSafeEqual) من X-Telegram-Bot-Api-Secret-Token
   2. مطابقة chat.id و from.id بصرامة مع TELEGRAM_CHAT_ID
   3. التحقق الصارم من صيغة callback_data + UUID
   4. تنفيذ قرارات الدفع عبر المحرك الموحد (payment-decisions.ts) وتسجيلها في اللوجس
   ============================================================ */

type TgCallbackQuery = {
  id: string;
  from?: { id?: number; first_name?: string; username?: string };
  message?: {
    message_id?: number;
    chat?: { id?: number };
    text?: string;
  };
  data?: string;
};

type TgUpdate = {
  update_id?: number;
  callback_query?: TgCallbackQuery;
};

const CALLBACK_RE =
  /^(tx|pr):([vsafu]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function adminDashboardUrl(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "https://miithaq.com")
    .trim()
    .replace(/\/+$/, "");
  return `${base}/admin`;
}

function buildUpdatedText(originalPlainText: string, statusLineHtml: string): string {
  const cleaned = originalPlainText.split("\n\n───\n")[0].trim();
  const stamp = new Date().toLocaleString("ar-SY");
  return `${escTelegramHtml(cleaned)}\n\n───\n${statusLineHtml}\n🕒 ${escTelegramHtml(stamp)}`;
}

function buildMarkup(rows: InlineKeyboardButton[][]): InlineKeyboardMarkup {
  const url = adminDashboardUrl();
  const finalRows = [...rows];
  if (url.startsWith("https://")) {
    finalRows.push([{ text: "🔗 فتح لوحة الأدمن", url }]);
  }
  return { inline_keyboard: finalRows };
}

export async function POST(req: NextRequest) {
  if (!telegramConfigured()) {
    return noStoreJson({ ok: false, message: "Telegram not configured" }, { status: 503 });
  }

  /* 1. التحقق الأمني الأول: سر Webhook بتوقيت ثابت */
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyTelegramWebhookSecret(secretHeader)) {
    return noStoreJson({ ok: false, message: "Unauthorized webhook" }, { status: 401 });
  }

  const parsed = await readBoundedJson<TgUpdate>(req, 32_768);
  if (!parsed.ok) {
    return noStoreJson({ ok: false, message: parsed.message }, { status: parsed.status });
  }

  const cb = parsed.data?.callback_query;
  if (!cb || !cb.id) {
    return noStoreJson({ ok: true, ignored: true });
  }

  /* 2. التحقق الأمني الثاني: مطابقة هوية المشرف ومحادثته بصرامة */
  const configuredChatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const msgChatId = cb.message?.chat?.id !== undefined ? String(cb.message.chat.id) : "";
  const fromId = cb.from?.id !== undefined ? String(cb.from.id) : "";
  const isPrivateChat = !configuredChatId.startsWith("-");

  const authorized =
    Boolean(configuredChatId) &&
    msgChatId === configuredChatId &&
    (!isPrivateChat || fromId === configuredChatId);

  if (!authorized) {
    await answerTelegramCallback(cb.id, "⛔ غير مصرّح لك بتنفيذ هذا الإجراء.", true);
    return noStoreJson({ ok: false, message: "Forbidden chat/sender" }, { status: 403 });
  }

  /* 3. التحقق الصارم من صيغة الأمر ومعرّف العملية */
  const data = String(cb.data || "").trim();
  const match = CALLBACK_RE.exec(data);
  if (!match) {
    await answerTelegramCallback(cb.id, "⚠️ أمر غير صالح.", true);
    return noStoreJson({ ok: false, message: "Invalid callback data" }, { status: 422 });
  }

  const [, kind, op, id] = match;
  const tgActor: DecisionActor = {
    actorId: null,
    actorName: cb.from?.first_name
      ? `${cb.from.first_name} (تيليجرام)`
      : "المشرف (تيليجرام)",
    actorEmail: cb.from?.username ? `@${cb.from.username}` : `tg:${fromId}`,
    via: "telegram",
  };

  let decision;
  let statusLineHtml = "";
  let nextButtons: InlineKeyboardButton[][] = [];

  if (kind === "tx") {
    if (op === "v") {
      decision = await decideTransaction(id, "verify", tgActor);
      statusLineHtml = "✅ <b>تم تأكيد الحوالة وتثبيت الباقة نهائياً</b> (عبر تيليجرام)";
      nextButtons = [];
    } else if (op === "s") {
      decision = await decideTransaction(id, "suspend", tgActor);
      statusLineHtml = "❄️ <b>تم تجميد الحساب وإبطال بصمة عقوده وQR فوراً</b> (عبر تيليجرام)";
      nextButtons = [[{ text: "🔓 فك التجميد (تراجع)", callback_data: `tx:u:${id}` }]];
    } else if (op === "u") {
      decision = await decideTransaction(id, "unsuspend", tgActor);
      statusLineHtml = "🔓 <b>تم رفع التجميد — يمكنك التأكيد أو التجميد مجدداً</b>";
      nextButtons = [
        [
          { text: "✅ تأكيد الحوالة", callback_data: `tx:v:${id}` },
          { text: "❄️ تجميد الحساب", callback_data: `tx:s:${id}` },
        ],
      ];
    } else {
      await answerTelegramCallback(cb.id, "⚠️ إجراء غير مدعوم.", true);
      return noStoreJson({ ok: false, message: "Unsupported tx op" }, { status: 422 });
    }
  } else {
    if (op === "a") {
      decision = await decidePaymentRequest(id, "paid", tgActor);
      statusLineHtml = "✅ <b>تم تأكيد الدفعة وتثبيت الباقة نهائياً</b> (عبر تيليجرام)";
      nextButtons = [];
    } else if (op === "f") {
      decision = await decidePaymentRequest(id, "freeze", tgActor);
      statusLineHtml = "❄️ <b>تم رفض الدفعة وتجميد الحساب وإبطال بصمة عقوده وQR فوراً</b> (عبر تيليجرام)";
      nextButtons = [[{ text: "🔓 فك التجميد وتأكيد", callback_data: `pr:u:${id}` }]];
    } else if (op === "u") {
      decision = await decidePaymentRequest(id, "unfreeze", tgActor);
      statusLineHtml = "🔓 <b>تم فك التجميد وتأكيد الدفعة وإعادة تفعيل الباقة</b> (عبر تيليجرام)";
      nextButtons = [];
    } else {
      await answerTelegramCallback(cb.id, "⚠️ إجراء غير مدعوم.", true);
      return noStoreJson({ ok: false, message: "Unsupported pr op" }, { status: 422 });
    }
  }

  /* 4. إظهار الإشعار الفوري + تحديث رسالة تيليجرام والأزرار */
  await answerTelegramCallback(
    cb.id,
    decision.ok ? `✅ ${decision.message}` : `ℹ️ ${decision.message}`,
    !decision.ok && !decision.alreadyDone
  );

  if (
    (decision.ok || decision.alreadyDone) &&
    cb.message?.message_id &&
    cb.message?.chat?.id &&
    cb.message?.text
  ) {
    const updatedText = buildUpdatedText(cb.message.text, statusLineHtml);
    await editTelegramMessage(
      cb.message.chat.id,
      cb.message.message_id,
      updatedText,
      buildMarkup(nextButtons)
    );
  }

  return noStoreJson(
    { ok: decision.ok, message: decision.message },
    { status: decision.ok ? 200 : decision.status }
  );
}
