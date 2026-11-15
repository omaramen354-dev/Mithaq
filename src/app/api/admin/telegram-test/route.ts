import { requireAdminSession } from "@/lib/admin-guard";
import { noStoreJson } from "@/lib/client-ip";
import { requestBaseUrl } from "@/lib/base-url";
import {
  registerTelegramWebhook,
  sendTelegramMessage,
  telegramConfigured,
} from "@/lib/telegram";

export const runtime = "nodejs";

/* ============================================================
   POST /api/admin/telegram-test
   1. يُسجّل عنوان Webhook تيليجرام الآمن تلقائياً (/api/telegram/webhook)
      حتى تعمل أزرار (✅ تأكيد الحوالة / ❄️ تجميد الحساب) بضغطة واحدة.
   2. يُرسل رسالة اختبار فورية لبوت تيليجرام (للمشرفين فقط).
   ============================================================ */

export async function POST() {
  const admin = await requireAdminSession();
  if (!admin) {
    return noStoreJson({ ok: false, message: "غير مصرح." }, { status: 403 });
  }

  if (!telegramConfigured()) {
    return noStoreJson(
      {
        ok: false,
        message:
          "متغيرات TELEGRAM_BOT_TOKEN أو TELEGRAM_CHAT_ID غير مضبوطة على الخادم بعد — أضفها في Vercel ثم أعد النشر.",
      },
      { status: 400 }
    );
  }

  const baseUrl = await requestBaseUrl();
  const hook = await registerTelegramWebhook(baseUrl);

  const now = new Date().toLocaleString("ar-SY");
  const hookLine = hook.ok
    ? "🔘 أزرار التأكيد والتجميد المباشرة داخل تيليجرام: <b>مفعّلة وجاهزة ✓</b>"
    : "⚠️ تعذّر تفعيل أزرار تيليجرام التفاعلية تلقائياً (الإشعارات تعمل بشكل طبيعي).";

  const res = await sendTelegramMessage(
    [
      "✅ <b>اختبار إشعارات منصة ميثاق ناجح!</b>",
      "",
      "البوت مربوط بالمنصة بنجاح وستصلك عليه جميع إشعارات الشحن (شام كاش + USDT) والأخطاء فوراً.",
      hookLine,
      `🕒 ${now}`,
    ].join("\n")
  );

  if (!res.ok) {
    const desc = String(res.description || "");
    const lower = desc.toLowerCase();
    return noStoreJson(
      {
        ok: false,
        message:
          lower.includes("unauthorized") || lower.includes("not found")
            ? "توكن البوت (TELEGRAM_BOT_TOKEN) غير صحيح — تأكد من نسخه دون شرطة مائلة."
            : lower.includes("chat not found") || lower.includes("forbidden")
            ? "تعذر الإرسال — تأكد من رقم TELEGRAM_CHAT_ID وأنك ضغطت Start في البوت."
            : "تعذر إرسال رسالة الاختبار — تأكد من إعدادات البوت في Vercel.",
      },
      { status: 502 }
    );
  }

  return noStoreJson({
    ok: true,
    webhookRegistered: hook.ok,
    message: hook.ok
      ? "تم تفعيل أزرار التأكيد/التجميد وإرسال رسالة الاختبار بنجاح ✓"
      : "تم إرسال رسالة الاختبار بنجاح (تحقق من HTTPS لتفعيل أزرار تيليجرام).",
  });
}
