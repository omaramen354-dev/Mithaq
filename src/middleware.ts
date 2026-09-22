import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/* ============================================================
   Middleware — يعمل على الحافة (Edge) بإعداد خالٍ من قاعدة
   البيانات. يحمي الصفحات التطبيقية ويترك المسارات العامة:
   /share/[id] و /verify/[id] و /api/* (تتحقق بنفسها داخلياً)
   ============================================================ */

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     - يستثني /api (كل معالجاتها تتحقق من الجلسة بنفسها وتُرجع 401 JSON)
     - يستثني /share و /verify (صفحات عامة للطرف الثاني والموثقين)
     - يستثني ملفات Next الثابتة والصور
    */
    "/((?!api|share|verify|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
