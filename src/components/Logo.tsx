/* شعار ميثاق الرسمي — النسخة الشفافة (بلا المربع الداكن الخارجي)
   تُعرض على خلفيات داكنة مباشرة: السايدبار، الهيرو، الترويسات */
export default function Logo({ height = 32 }: { height?: number }) {
  return (
    <img
      src="/mithaq-logo-transparent.svg"
      alt="ميثاق — منصة العقود الذكية"
      height={height}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
