import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { desc, eq, and, inArray } from "drizzle-orm";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/errors — جمعية أخطاء المنصة (Error Collector)

   POST: يستقبل الأخطاء من:
   - المتصفح: window.onerror + unhandledrejection + ErrorBoundary
     (متاح للجميع — ضيوف ومستخدمون — لنضغط الأخطاء الحرجة)
   - الخادم: try/catch في الـ route handlers الحرجة
   يُخزن في activity_logs بـ entity = "error" و action = "error_browser"
   أو "error_server" مع level = error|warning.

   GET: للأدمن فقط — آخر الأخطاء مع فلترة بالمصدر (browser/server).

   DELETE: للأدمن فقط — مسح خطأ واحد أو الكل (تنظيف بعد المعالجة).
   ============================================================ */

type ErrorBody = {
  message?: string;
  stack?: string;
  source?: string;
  url?: string;
  line?: number;
  col?: number;
  userAgent?: string;
  component?: string;
  extra?: Record<string, unknown>;
};

/* حد أقصى لطول الرسالة والستاك حتى لا تُهيق قاعدة البيانات */
const MAX_MSG = 500;
const MAX_STACK = 3000;

/* ===== حد إغراق بسيط لكل IP (نافذة متحركة في الذاكرة) =====
   يعمل لكل نسخة من الخادم — كافٍ لمنع الإغراق العادي دون
   تعقيد خارجي. الغرض حماية سجل الأحداث من التضخم */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 15;
const rateHits = new Map<string, number[]>();

function isFlooding(ip: string): boolean {
  const now = Date.now();
  if (rateHits.size > 5000) rateHits.clear(); /* تنظيف ذاكرة وقائي */
  const arr = (rateHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  rateHits.set(ip, arr);
  return arr.length > RATE_MAX;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (isFlooding(ip)) {
    /* 429 صامت — لا نكتب شيئاً حتى لا يكون الإغراق وسيلة للتضخم */
    return new NextResponse(null, { status: 429 });
  }

  let body: ErrorBody;
  try {
    body = (await req.json()) as ErrorBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = String(body.message || "").slice(0, MAX_MSG).trim();
  if (!message) return NextResponse.json({ ok: false }, { status: 422 });

  /* من غير المسجلين نحد الستاك حتى لا يعبّث أحدهم بالجدول */
  const session = await auth();
  const isUser = Boolean(session?.user?.dbId);

  const stack = isUser ? String(body.stack || "").slice(0, MAX_STACK) : "";
  const source = body.source === "server" ? "server" : "browser";

  await logEvent({
    action: source === "server" ? "error_server" : "error_browser",
    entity: "error",
    entityId: "",
    actorId: session?.user?.dbId || null,
    actorName: session?.user?.name || "",
    actorEmail: session?.user?.email || "",
    detail: message,
    meta: {
      level: "error",
      stack,
      url: String(body.url || "").slice(0, 300),
      line: body.line || null,
      col: body.col || null,
      component: String(body.component || "").slice(0, 100),
      userAgent: String(body.userAgent || req.headers.get("user-agent") || "").slice(0, 250),
      extra: body.extra || {},
    },
  });

  /* نعيد 204 بلا جسم — أخف وزناً على الشبكة */
  return new NextResponse(null, { status: 204 });
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.dbId || !session.user.isAdmin) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const source = req.nextUrl.searchParams.get("source") || "";
  const filters = [eq(activityLogs.entity, "error")];
  if (source === "browser" || source === "server") {
    filters.push(
      eq(
        activityLogs.action,
        source === "browser" ? "error_browser" : "error_server"
      )
    );
  }

  const rows = await db
    .select()
    .from(activityLogs)
    .where(and(...filters))
    .orderBy(desc(activityLogs.createdAt))
    .limit(100);

  return NextResponse.json({
    ok: true,
    errors: rows.map((r) => ({
      id: r.id,
      action: r.action,
      detail: r.detail,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      meta: (r.meta || {}) as {
        stack?: string;
        url?: string;
        line?: number | null;
        col?: number | null;
        component?: string;
        userAgent?: string;
        level?: string;
      },
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  let body: { id?: string; all?: boolean };
  try {
    body = (await req.json()) as { id?: string; all?: boolean };
  } catch {
    body = {};
  }

  if (body.all) {
    await db.delete(activityLogs).where(eq(activityLogs.entity, "error"));
    return NextResponse.json({ ok: true, message: "تم مسح كل الأخطاء." });
  }

  const id = (body.id || "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, message: "المعرّف مفقود." }, { status: 422 });
  }
  await db
    .delete(activityLogs)
    .where(and(eq(activityLogs.entity, "error"), inArray(activityLogs.id, [id])));
  return NextResponse.json({ ok: true, message: "تم حذف الخطأ." });
}
