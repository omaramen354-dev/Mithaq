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
    /* حماية الصفحات التطبيقية — المسارات العامة (/share و /verify) مستثناة
       من matcher في middleware.ts لذا لا تمر من هنا إطلاقاً */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");

      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", request.nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
