/* إعداد Auth.js الحافة (Edge-safe) — بدون استعلامات قاعدة بيانات */
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    /* Guest-First: الصفحة الرئيسية / عامة للجميع — الضيف يجرب المنصة كاملة
       دون تسجيل دخول، والحماية تُطبَّق فقط على صفحات التطبيق الخاصة
       (/print وغيرها) وعلى عمليات الكتابة داخل الـ APIs نفسها.
       المسارات العامة (/share و /verify) مستثناة أصلاً من matcher
       في proxy.ts لذا لا تمر من هنا إطلاقاً */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");

      if (isLoginPage) {
        /* المسجل يفتح /login → يُعاد للوحة مباشرة */
        if (isLoggedIn) return Response.redirect(new URL("/", request.nextUrl));
        return true;
      }

      /* صفحات عامة للفهرسة والضيوف: الرئيسية، الأسعار، أدلة العقود،
         والصفحتان القانونيتان. حمايتها كانت تُرجع جوجل إلى /login
         فتمنع فهرستها — والوصول لبيانات المستخدم يبقى محمياً في الصفحات
         والـ APIs الخاصة نفسها */
      const path = request.nextUrl.pathname;
      if (
        path === "/" ||
        path === "/sample" ||
        path === "/pricing" ||
        path === "/privacy" ||
        path === "/terms" ||
        path === "/contracts" ||
        path.startsWith("/contracts/")
      )
        return true;

      /* بقية الصفحات التطبيقية (مثل /print) للمسجلين فقط —
         مع حفظ المسار المطلوب في callbackUrl للعودة بعد الدخول */
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
