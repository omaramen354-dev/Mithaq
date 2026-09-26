import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/* ============================================================
   opengraph-image — صورة معاينة روابط ميثاق (واتساب/تويتر/تلجرام)
   بالهوية الأسطورية: الزمردي + الذهبي + خط ثمانية + اللوغو.
   تُبنى مرة واحدة عند النشر عبر @vercel/og (Satori + resvg).
   ============================================================ */

export const alt = "ميثاق — منصة العقود والتوثيق الإلكتروني";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const fontsDir = path.join(process.cwd(), "src/app/fonts");
  const [sansBold, displayBlack, logoSvg] = await Promise.all([
    readFile(path.join(fontsDir, "og-thmanyah-sans-bold.otf")),
    readFile(path.join(fontsDir, "og-thmanyah-display-black.otf")),
    readFile(path.join(process.cwd(), "public/mithaq-logo-v2.svg")),
  ]);
  const logoDataUri = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #122e26 0%, #1d4a3e 45%, #1f5244 100%)",
          position: "relative",
        }}
      >
        {/* نقشة سداسيات خفيفة */}
        <svg
          width="1200"
          height="630"
          style={{ position: "absolute", inset: 0, opacity: 0.08 }}
        >
          <defs>
            <pattern
              id="hex"
              x="0"
              y="0"
              width="90"
              height="90"
              patternUnits="userSpaceOnUse"
            >
              <g fill="none" stroke="#ffffff" strokeWidth="0.7">
                <polygon points="45,3 84,25 84,65 45,87 6,65 6,25" />
                <polygon points="45,14 72,30 72,60 45,76 18,60 18,30" />
                <line x1="45" y1="3" x2="45" y2="87" />
              </g>
            </pattern>
          </defs>
          <rect width="1200" height="630" fill="url(#hex)" />
        </svg>

        {/* إطار ذهبي داخلي */}
        <div
          style={{
            position: "absolute",
            inset: 28,
            border: "2px solid rgba(212, 168, 67, 0.45)",
            borderRadius: 24,
            display: "flex",
          }}
        />

        {/* اللوغو داخل صندوقه */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#162E1C",
            border: "2px solid rgba(242, 218, 160, 0.5)",
            borderRadius: 18,
            padding: "14px 22px",
            marginBottom: 30,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDataUri} width={150} height={89} alt="" />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: 2,
          }}
        >
          منصة ميثاق
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 40,
            fontWeight: 700,
            color: "#D4A843",
            marginTop: 16,
          }}
        >
          عقودك بثقة وسهولة — في دقائق
        </div>

        <div
          style={{
            display: "flex",
            gap: 18,
            marginTop: 44,
            fontSize: 26,
            fontWeight: 700,
            color: "rgba(244, 241, 225, 0.85)",
          }}
        >
          <div style={{ display: "flex" }}>عقود جاهزة</div>
          <div style={{ display: "flex", color: "#D4A843" }}>•</div>
          <div style={{ display: "flex" }}>توقيع رقمي</div>
          <div style={{ display: "flex", color: "#D4A843" }}>•</div>
          <div style={{ display: "flex" }}>بصمة SHA-256</div>
        </div>

        {/* خط ذهبي سفلي */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 10,
            background: "linear-gradient(90deg, #B8922E, #F0C85A, #B8922E)",
            display: "flex",
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "thmanyah-sans", data: sansBold, weight: 700, style: "normal" },
        { name: "thmanyah-display", data: displayBlack, weight: 900, style: "normal" },
      ],
    }
  );
}
