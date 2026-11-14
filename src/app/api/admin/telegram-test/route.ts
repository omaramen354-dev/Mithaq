import { requireAdminSession } from "@/lib/admin-guard";
import { noStoreJson } from "@/lib/client-ip";
import { sendTelegramMessage, telegramConfigured } from "@/lib/telegram";

export const runtime = "nodejs";

/* ============================================================
   POST /api/admin/telegram-test
   إرسال رسالة اختبار فورية لبوت تيليجرام (للمشرفين فقط)
   للتحقق من صحة TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID على الإنتاج.
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

  const now = new Date().toLocaleString("ar-SY");
  const res = await sendTelegramMessage(
    [
      "✅ <b>اختبار إشعارات منصة ميثاق ناجح!</b>",
      "",
      "البوت مربوط بالمنصة بنجاح وستصلك عليه جميع إشعارات الشحن والتوقيعات فوراً.",
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
    message: "تم إرسال رسالة الاختبار بنجاح — افتح تيليجرام وتأكد من وصولها!",
  });
}
