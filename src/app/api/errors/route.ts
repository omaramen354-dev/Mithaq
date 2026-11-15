import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdminSession } from "@/lib/admin-guard";
import { isUuid } from "@/lib/contract-schema";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { desc, eq, and, inArray } from "drizzle-orm";
import { logEvent } from "@/lib/logger";
import { readBoundedJson } from "@/lib/contract-text";
import { extractClientIp, noStoreJson, NO_STORE_HEADERS } from "@/lib/client-ip";
import { notifyErrorEvent } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/errors — جمعية أخطاء المنصة (Error Collector)
   - POST العام يسجّل دائماً كـ error_browser (لا يُسمح بتزوير error_server من الخارج)
   - حد إغراق محمي ضد تزوير X-Forwarded-For + حد عام احتياطي للطلبات المجهولة
   - GET/DELETE للمشرفين فقط مع التحقق من UUID
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

const MAX_MSG = 500;
const MAX_STACK = 3000;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 15;
const RATE_MAX_GLOBAL_UNAUTH = 15;
const rateHits = new Map<string, number[]>();

/* حماية إشعارات تيليجرام للأخطاء:
   - لا يُكرّر نفس الخطأ على تيليجرام أكثر من مرة كل 5 دقائق
   - سقف عالمي 6 تنبيهات خطأ في 5 دقائق لمنع أي إغراق للمشرف */
const TG_DEDUP_MS = 5 * 60_000;
const TG_MAX_GLOBAL_WINDOW = 6;
const tgDedup = new Map<string, number>();
let tgGlobalHits: number[] = [];

function shouldAlertTelegram(signature: string): boolean {
  const now = Date.now();
  tgGlobalHits = tgGlobalHits.filter((t) => now - t < TG_DEDUP_MS);
  if (tgGlobalHits.length >= TG_MAX_GLOBAL_WINDOW) return false;

  if (tgDedup.size > 500) {
    for (const [k, ts] of tgDedup.entries()) {
      if (now - ts >= TG_DEDUP_MS) tgDedup.delete(k);
    }
  }
  const last = tgDedup.get(signature);
  if (last && now - last < TG_DEDUP_MS) return false;

  tgDedup.set(signature, now);
  tgGlobalHits.push(now);
  return true;
}

function isFlooding(key: string, max: number): boolean {
  const now = Date.now();
  if (rateHits.size > 5000) rateHits.clear();
  const arr = (rateHits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  rateHits.set(key, arr);
  return arr.length > max;
}

export async function POST(req: NextRequest) {
  const ip = extractClientIp(req.headers);
  const session = await auth();
  const isUser = Boolean(session?.user?.dbId);

  if (
    isFlooding(`ip:${ip}`, RATE_MAX_PER_IP) ||
    (!isUser && isFlooding("global:unauth", RATE_MAX_GLOBAL_UNAUTH))
  ) {
    return new NextResponse(null, { status: 429, headers: NO_STORE_HEADERS });
  }

  const parsed = await readBoundedJson<ErrorBody>(req, 16_384);
  if (!parsed.ok) {
    return noStoreJson({ ok: false }, { status: parsed.status });
  }
  const body = parsed.data;

  const message = String(body.message || "").slice(0, MAX_MSG).trim();
  if (!message) return noStoreJson({ ok: false }, { status: 422 });

  const stack = isUser ? String(body.stack || "").slice(0, MAX_STACK) : "";

  /* لا يُسمح لطلبات HTTP العامة بتزوير أخطاء الخادم (error_server) */
  let extra: Record<string, unknown> = {};
  if (body.extra && typeof body.extra === "object" && !Array.isArray(body.extra)) {
    try {
      const serialized = JSON.stringify(body.extra);
      if (serialized.length <= 2048) extra = body.extra as Record<string, unknown>;
      else extra = { truncated: true, size: serialized.length };
    } catch {
      extra = { invalid: true };
    }
  }

  const component = String(body.component || "").slice(0, 100);
  const pageUrl = String(body.url || "").slice(0, 300);

  await logEvent({
    action: "error_browser",
    entity: "error",
    entityId: "",
    actorId: session?.user?.dbId || null,
    actorName: session?.user?.name || "",
    actorEmail: session?.user?.email || "",
    detail: message,
    meta: {
      level: "error",
      stack,
      url: pageUrl,
      line: typeof body.line === "number" && Number.isFinite(body.line) ? body.line : null,
      col: typeof body.col === "number" && Number.isFinite(body.col) ? body.col : null,
      component,
      userAgent: String(body.userAgent || req.headers.get("user-agent") || "").slice(0, 250),
      ip,
      extra,
    },
  });

  /* إرسال تنبيه فوري لتيليجرام للأخطاء الحقيقية (مستخدم مسجّل أو خطأ Boundary حرج)
     مع منع الإغراق والتكرار لمدة 5 دقائق */
  const isCriticalBoundary =
    component === "error-boundary" || message.startsWith("[Boundary]");
  if (isUser || isCriticalBoundary) {
    const sig = `${component}|${message.slice(0, 80)}`;
    if (shouldAlertTelegram(sig)) {
      const adminBase = (
        process.env.NEXT_PUBLIC_BASE_URL ||
        req.nextUrl.origin ||
        ""
      ).replace(/\/+$/, "");
      notifyErrorEvent({
        source: "browser",
        message,
        component,
        url: pageUrl,
        userName: session?.user?.name || "",
        userEmail: session?.user?.email || "",
        adminUrl: adminBase ? `${adminBase}/admin` : undefined,
      }).catch(() => {});
    }
  }

  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}

const requireAdmin = requireAdminSession;

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
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

  return noStoreJson({
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
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const parsed = await readBoundedJson<{ id?: string; all?: boolean }>(req, 8_192);
  const body = parsed.ok ? parsed.data : {};

  if (body.all) {
    await db.delete(activityLogs).where(eq(activityLogs.entity, "error"));
    return noStoreJson({ ok: true, message: "تم مسح كل الأخطاء." });
  }

  const id = String(body.id || "").trim();
  if (!isUuid(id)) {
    return noStoreJson({ ok: false, message: "معرّف الخطأ غير صالح." }, { status: 422 });
  }
  await db
    .delete(activityLogs)
    .where(and(eq(activityLogs.entity, "error"), inArray(activityLogs.id, [id])));
  return noStoreJson({ ok: true, message: "تم حذف الخطأ." });
}
