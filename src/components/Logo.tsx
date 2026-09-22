/* شعار ميثاق الرسمي — يُستخدم في كل ترويسات المنصة
   اللوغو: خط كوفي + إطار مزدوج (أخضر داكن #162E1C / كريمي / ذهبي) */
export default function Logo({ height = 32 }: { height?: number }) {
  return (
    <img
      src="/logo.svg"
      alt="ميثاق — منصة العقود الذكية"
      height={height}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
