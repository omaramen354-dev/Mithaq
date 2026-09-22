/* إنشاء جداول Neon عبر قناة neon-http (HTTPS/443) — نفس قناة التطبيق
   بديل drizzle-kit push عند الشبكات التي تحجب TCP 5432
   الاستخدام: node scripts/db-push.mjs */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const client = neon(env.DATABASE_URL);
const db = drizzle(client);

/* ===== تكرار تعريف drizzle-kit: CREATE IF NOT EXISTS آمن للتكرار ===== */
const statements = [
  /* users */
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id text NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    name text NOT NULL DEFAULT 'مستخدم ميثاق',
    picture text DEFAULT '',
    phone text DEFAULT '',
    address text DEFAULT '',
    plan text NOT NULL DEFAULT 'free',
    plan_expires_at timestamptz,
    preferences jsonb NOT NULL DEFAULT '{"darkMode":false,"emailNotifications":true,"contractReminders":true,"language":"ar"}'::jsonb,
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  )`,
  /* contracts */
  `CREATE TABLE IF NOT EXISTS contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
    type text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    signing_mode text NOT NULL DEFAULT 'send',
    party1_name text NOT NULL,
    party2_name text NOT NULL,
    amount text DEFAULT '',
    city text DEFAULT '',
    country text DEFAULT '',
    subject text DEFAULT '',
    duration text DEFAULT '',
    payment_method text DEFAULT '',
    notes text DEFAULT '',
    clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
    content text NOT NULL DEFAULT '',
    content_hash text NOT NULL DEFAULT '',
    sig1_data_url text,
    sig1_name text,
    sig1_signed_at timestamptz,
    sig2_data_url text,
    sig2_name text,
    sig2_signed_at timestamptz,
    share_token text NOT NULL UNIQUE,
    qr_data_url text,
    favorite boolean NOT NULL DEFAULT false,
    premium boolean NOT NULL DEFAULT false,
    review_status text NOT NULL DEFAULT 'none',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  /* signature_events */
  `CREATE TABLE IF NOT EXISTS signature_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    party text NOT NULL,
    signer_name text NOT NULL,
    ip_address text DEFAULT 'unknown',
    user_agent text DEFAULT 'unknown',
    signed_at timestamptz NOT NULL DEFAULT now()
  )`,
  /* payment_requests */
  `CREATE TABLE IF NOT EXISTS payment_requests (
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
  /* الفهارس */
  `CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
  `CREATE INDEX IF NOT EXISTS contracts_owner_idx ON contracts (owner_id)`,
  `CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts (status)`,
  `CREATE INDEX IF NOT EXISTS contracts_created_idx ON contracts (created_at)`,
  `CREATE INDEX IF NOT EXISTS sig_events_contract_idx ON signature_events (contract_id)`,
];

console.log("⏳ إنشاء الجداول في Neon عبر HTTPS...");
for (const stmt of statements) {
  const label = stmt.match(/CREATE (?:TABLE|INDEX) IF NOT EXISTS (\w+)/)?.[1] || "stmt";
  try {
    await db.execute(sql.raw(stmt));
    console.log("  ✓", label);
  } catch (e) {
    console.error("  ✗", label, "→", e.message);
    process.exitCode = 1;
  }
}

/* تحقق نهائي */
const check = await db.execute(
  sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
);
console.log(
  "\n📊 الجداول في Neon:",
  check.rows.map((r) => r.table_name).join(", ")
);
