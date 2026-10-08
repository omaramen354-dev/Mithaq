/* ============================================================
   ThemeInit — سكربت مضمّن يعمل قبل الرسم الأول
   يقرأ تفضيل المستخدم من localStorage ويضيف كلاس "dark" فوراً
   قبل ظهور أي محتوى — يمنع وميض الصفحة الفاتحة (FOUC).
   ============================================================ */

const SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("mithaq-theme");
    if (t === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function ThemeInit() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
