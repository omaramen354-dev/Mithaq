import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/* الصفحة الرئيسية: تتطلب تسجيل الدخول — لوحة العقود الكاملة
   تُبنى كمكوّن Dashboard في الخطوة التالية من الهجرة */
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 520, padding: 28, textAlign: "center" }}>
        <b style={{ fontSize: 18, fontWeight: 900 }}>
          أهلاً {session.user.name || "بك"} 👋
        </b>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          الاتصال بقاعدة البيانات يعمل، ولوحة إدارة العقود الكاملة (الجدول + نموذج
          الإنشاء + نافذة الإرسال) تُبنى في الخطوة التالية من الهجرة.
        </p>
        <form
          action={async () => {
            "use server";
            const { signOut } = await import("@/lib/auth");
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="btn btn-soft" type="submit">
            تسجيل الخروج
          </button>
        </form>
      </div>
    </main>
  );
}
