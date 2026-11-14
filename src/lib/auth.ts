import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/* ============================================================
   Auth.js v5 — مصادقة Google مع مزامنة جدول users في Neon
   - يتحقق من email_verified === true في حساب Google
   - يعمل بوضع Fail-Closed عند تعذر مزامنة المستخدم في قاعدة البيانات
   - الصلاحية الإدارية تُقاس حياً عبر admin-guard ولا تُثبّت بشكل ملتصق
   ============================================================ */

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      picture?: string | null;
      id: string; // sub من Google
      dbId?: string; // UUID في جدول users
      isAdmin?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    dbId?: string;
    isAdmin?: boolean;
  }
}

export const adminEmails = (): string[] =>
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

type DbSyncResult = { dbId: string; isAdmin: boolean } | null;

/** إنشاء/تحديث سجل المستخدم في Neon عند كل دخول */
async function syncUser(profile: {
  sub: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
}): Promise<DbSyncResult> {
  const email = (profile.email || "").toLowerCase().trim();
  if (!email || !profile.sub) return null;
  const admins = adminEmails();
  const isAdminFlag = admins.includes(email);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.googleId, profile.sub))
    .limit(1);

  if (existing.length) {
    const now = new Date();

    /* شبكة أمان: أي اشتراك محدد المدة منتهٍ يُعاد للمجانية فوراً عند أول دخول */
    const timedPlan =
      existing[0].plan !== "free" && existing[0].plan !== "single";
    const planExpired =
      timedPlan &&
      existing[0].planExpiresAt !== null &&
      existing[0].planExpiresAt.getTime() < now.getTime();

    /* إذا كانت قائمة ADMIN_EMAILS مضبوطة، يُمنح المشرف تلقائياً لمن فيها،
       ولا تلتصق الصلاحية قسراً عند إزالته من ADMIN_EMAILS إلا إذا رُقّي
       يدوياً من داخل قاعدة البيانات (حارس المشرف يقرأ من DB مباشرة) */
    const nextIsAdmin = admins.length > 0 ? isAdminFlag : existing[0].isAdmin;

    const updated = await db
      .update(users)
      .set({
        name: profile.name || existing[0].name,
        email,
        picture: profile.picture || existing[0].picture,
        isAdmin: nextIsAdmin,
        lastSeenAt: now,
        ...(planExpired ? { plan: "free", planExpiresAt: null } : {}),
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return { dbId: updated[0].id, isAdmin: updated[0].isAdmin };
  }

  /* لا ترقية تلقائية لأول مستخدم: المشرفية تُمنح حصراً عبر ADMIN_EMAILS */
  const inserted = await db
    .insert(users)
    .values({
      googleId: profile.sub,
      email,
      name: profile.name || "مستخدم ميثاق",
      picture: profile.picture || "",
      isAdmin: isAdminFlag,
    })
    .returning();
  return { dbId: inserted[0].id, isAdmin: inserted[0].isAdmin };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, profile, account }) {
      /* رفض حسابات Google غير المؤكَّد بريدها الإلكتروني */
      if (
        account?.provider === "google" &&
        profile &&
        "email_verified" in profile &&
        profile.email_verified !== true
      ) {
        return false;
      }

      try {
        const synced = await syncUser({
          sub: profile?.sub || user.id || "",
          name: profile?.name ?? user.name,
          email: profile?.email ?? user.email,
          picture: profile?.picture ?? user.image,
        });
        if (!synced) return false;
        /* نمرّر نتائج المزامنة إلى jwt callback عبر user */
        (user as { dbSync?: DbSyncResult }).dbSync = synced;
        return true;
      } catch (error) {
        console.error("syncUser failed:", error);
        /* Fail-Closed: لا نسمح بإنشاء جلسة ناقصة بلا dbId */
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id; // sub من Google
        const sync = (user as { dbSync?: DbSyncResult }).dbSync;
        if (sync) {
          token.dbId = sync.dbId;
          token.isAdmin = sync.isAdmin;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || "";
        session.user.dbId = token.dbId;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
