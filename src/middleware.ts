import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/* ============================================================
   Middleware — يعمل على الحافة (Edge) بإعداد خالٍ من قاعدة البيانات.

   استراتيجية Guest-First:
   - المسار الرئيسي / عام (Public) — الضيف يفتح اللوحة ويجرب نموذج
     إنشاء العقد والبنود والمعاينة الديناميكية دون أي تسجيل دخول.
   - صفحات التوقيع العام /share/[id] و /verify/[id] عامة كما هي.
   - الحماية الفعلية للبيانات تُطبَّق داخل مسارات الـ API نفسها
     (مثل POST /api/contracts الذي يرجع 401 JSON لغير المسجلين)،
     بينما يحمي الـ middleware صفحات التطبيق الخاصة مثل /print/[id]
     (مع callbackUrl للعودة بعد الدخول).
   ============================================================ */

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     - يستثني /api (كل معالجاتها تتحقق من الجلسة بنفسها وتُرجع 401 JSON
       لغير المسجلين — بما فيها POST /api/contracts)
     - يستثني /share و /verify (صفحات عامة للطرف الثاني والموثقين)
     - يستثني ملفات Next الثابتة والصور
     - المسار الرئيسي / يمر من الـ middleware لكن authorized يعيده true
       للضيوف والمسجلين (عام) — انظر authConfig.callbacks.authorized
    */
    "/((?!api|share|verify|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
