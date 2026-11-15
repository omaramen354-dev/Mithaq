import { requireAdminSession } from "@/lib/admin-guard";
import { db } from "@/db";
import { sql, type SQL } from "drizzle-orm";
import { logEvent } from "@/lib/logger";
import { noStoreJson } from "@/lib/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/db-sync — مزامنة جداول وأعمدة Neon بنقرة واحدة
   - للمشرفين فقط (requireAdminSession)
   - يستخدم عبارات SQL ثابتة وموسومة (بدون sql.raw) مع IF NOT EXISTS
     الآمنة 100% — لا يحذف ولا يمسّ أي بيانات موجودة
   - يُصلح فوراً نقص جدول transactions أو أي عمود أُضيف في التحديثات
   ============================================================ */

const SYNC_STATEMENTS: { name: string; query: SQL }[] = [
  {
    name: "enum:transaction_status",
    query: sql`DO $$ BEGIN
      CREATE TYPE transaction_status AS ENUM ('unverified', 'verified', 'suspended');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$`,
  },
  {
    name: "users.paid_once",
    query: sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_once boolean NOT NULL DEFAULT false`,
  },
  {
    name: "users.is_single_used",
    query: sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_single_used boolean NOT NULL DEFAULT false`,
  },
  {
    name: "contracts.party2_email",
    query: sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS party2_email text NOT NULL DEFAULT ''`,
  },
  {
    name: "contracts.party2_google_id",
    query: sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS party2_google_id text NOT NULL DEFAULT ''`,
  },
  {
    name: "signature_events.signer_email",
    query: sql`ALTER TABLE signature_events ADD COLUMN IF NOT EXISTS signer_email text DEFAULT ''`,
  },
  {
    name: "table:transactions",
    query: sql`CREATE TABLE IF NOT EXISTS transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      transaction_number text NOT NULL UNIQUE,
      contact_phone text NOT NULL DEFAULT '',
      plan_name text NOT NULL DEFAULT '',
      status transaction_status NOT NULL DEFAULT 'unverified',
      admin_note text DEFAULT '',
      reviewed_by uuid,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "transactions.contact_phone",
    query: sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT ''`,
  },
  {
    name: "transactions.plan_name",
    query: sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plan_name text NOT NULL DEFAULT ''`,
  },
  {
    name: "transactions.admin_note",
    query: sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS admin_note text DEFAULT ''`,
  },
  {
    name: "transactions.reviewed_by",
    query: sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reviewed_by uuid`,
  },
  {
    name: "transactions.reviewed_at",
    query: sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`,
  },
  {
    name: "transactions.updated_at",
    query: sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
  },
  {
    name: "table:payment_requests",
    query: sql`CREATE TABLE IF NOT EXISTS payment_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
      plan text NOT NULL,
      amount_usd text NOT NULL DEFAULT '0',
      method text NOT NULL DEFAULT 'usdt',
      status text NOT NULL DEFAULT 'pending',
      tx_ref text DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "table:guest_prompt_seen",
    query: sql`CREATE TABLE IF NOT EXISTS guest_prompt_seen (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ip_hash text NOT NULL UNIQUE,
      user_agent text DEFAULT '',
      drafts_saved integer NOT NULL DEFAULT 1,
      seen_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "table:activity_logs",
    query: sql`CREATE TABLE IF NOT EXISTS activity_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_name text DEFAULT '',
      actor_email text DEFAULT '',
      action text NOT NULL,
      entity text NOT NULL,
      entity_id text DEFAULT '',
      detail text DEFAULT '',
      meta jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "idx:transactions_user",
    query: sql`CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions (user_id)`,
  },
  {
    name: "idx:transactions_status",
    query: sql`CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions (status)`,
  },
  {
    name: "idx:transactions_created",
    query: sql`CREATE INDEX IF NOT EXISTS transactions_created_idx ON transactions (created_at)`,
  },
  {
    name: "idx:transactions_user_status",
    query: sql`CREATE INDEX IF NOT EXISTS transactions_user_status_idx ON transactions (user_id, status)`,
  },
  {
    name: "idx:guest_prompt_ip",
    query: sql`CREATE UNIQUE INDEX IF NOT EXISTS guest_prompt_ip_hash_idx ON guest_prompt_seen (ip_hash)`,
  },
  {
    name: "idx:activity_logs_created",
    query: sql`CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON activity_logs (created_at)`,
  },
  {
    name: "idx:activity_logs_entity",
    query: sql`CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON activity_logs (entity)`,
  },
];

export async function POST() {
  const session = await requireAdminSession();
  if (!session) {
    return noStoreJson({ ok: false, message: "غير مصرّح." }, { status: 403 });
  }

  const applied: string[] = [];
  const failed: string[] = [];

  for (const step of SYNC_STATEMENTS) {
    try {
      await db.execute(step.query);
      applied.push(step.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push(`${step.name}: ${msg.slice(0, 120)}`);
    }
  }

  await logEvent({
    action: "db_schema_synced",
    entity: "system",
    entityId: "",
    actorId: session.user.dbId,
    actorName: session.user.name || "",
    actorEmail: session.user.email || "",
    detail: `مزامنة جداول Neon: نجح ${applied.length} · تعذّر ${failed.length}`,
    meta: { appliedCount: applied.length, failed },
  });

  if (failed.length > 0) {
    return noStoreJson(
      {
        ok: false,
        appliedCount: applied.length,
        failed,
        message: `تم تحديث ${applied.length} عنصراً، وتعذّر ${failed.length}: ${failed[0]}`,
      },
      { status: 500 }
    );
  }

  return noStoreJson({
    ok: true,
    appliedCount: applied.length,
    message: `تمت مزامنة وإنشاء جميع الجداول والأعمدة الناقصة في Neon بنجاح (${applied.length} خطوة)!`,
  });
}
