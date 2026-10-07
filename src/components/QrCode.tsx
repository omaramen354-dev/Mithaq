import { qrSvg } from "@/lib/qr";

/* ============================================================
   QrCode — رمز QR للتحقق من العقد (SVG خالٍ من الاعتماديات)
   يُولَّد لحظياً على الخادم أو المتصفح ويشير إلى صفحة /verify
   ============================================================ */

export default function QrCode({
  value,
  size = 96,
  ink = "#0b1f1a",
  label = "امسح للتحقق من العقد",
}: {
  value: string;
  size?: number;
  ink?: string;
  label?: string;
}) {
  if (!value) return null;
  const svg = qrSvg(value, { size, ecc: "M", ink });
  return (
    <span
      className="qr-code"
      style={{ display: "inline-block", width: size, height: size, lineHeight: 0 }}
      title={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
