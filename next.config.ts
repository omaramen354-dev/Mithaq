import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/* 'unsafe-eval' يحتاجه React Refresh في التطوير فقط — لا يُرسل في الإنتاج */
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  "https://accounts.google.com",
].join(" ");

const connectSrc = [
  "'self'",
  "https://accounts.google.com",
  "https://www.googleapis.com",
  ...(isDev ? ["ws:", "wss:"] : []),
].join(" ");

const nextConfig: NextConfig = {
  /* الخطوط من Google Fonts تُحمَّل عبر next/font (بدون إعداد إضافي) */
  reactStrictMode: true,
  /* لا نكشف إصدار الإطار في الترويسات */
  poweredByHeader: false,

  async headers() {
    return [
      {
        /* ترويسات الأمان لكل مسارات الموقع (توصيات فحص الأمان) */
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              /* 'unsafe-inline' مطلوب لسكربتات Next المضمّنة، وaccounts.google.com لتسجيل الدخول.
                 Font Awesome يُقدَّم محلياً — لا CDN خارجي. */
              `script-src ${scriptSrc}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "frame-src 'self' https://accounts.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              ...(isDev ? [] : ["upgrade-insecure-requests"]),
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
