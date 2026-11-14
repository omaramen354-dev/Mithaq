import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIZZLE_NAME = Symbol.for("drizzle:Name");
const DRIZZLE_COLS = Symbol.for("drizzle:Columns");

/* ============================================================
   In-Memory Postgres-Like Mock for Drizzle ORM (Neon HTTP)
   faithfully evaluates Drizzle AST expressions, strict UUID
   checks (22P02), UNIQUE constraints, batch(), and async delay
   to expose real TOCTOU race conditions.
   ============================================================ */

export function createMockState() {
  return {
    session: null,
    dbDelayMs: 0,
    lastSqlErrors: [],
    lastLimitArgs: [],
    tables: {
      users: [],
      contracts: [],
      signature_events: [],
      guest_prompt_seen: [],
      transactions: [],
      payment_requests: [],
      activity_logs: [],
    },
  };
}

const COL_MAP_CACHE = new WeakMap();
function getColMeta(table) {
  if (COL_MAP_CACHE.has(table)) return COL_MAP_CACHE.get(table);
  const cols = table[DRIZZLE_COLS] || {};
  const bySqlName = {};
  for (const [jsName, col] of Object.entries(cols)) {
    bySqlName[col.name] = { jsName, col, isUuid: col.dataType === "string" && col.columnType === "PgUUID" };
  }
  const meta = { tableName: table[DRIZZLE_NAME], bySqlName, cols };
  COL_MAP_CACHE.set(table, meta);
  return meta;
}

function assertUuidIfNeeded(col, val) {
  if (col && col.columnType === "PgUUID" && val !== null && val !== undefined) {
    if (typeof val !== "string" || !UUID_RE.test(val)) {
      const err = new Error(`invalid input syntax for type uuid: "${String(val)}"`);
      err.code = "22P02";
      throw err;
    }
  }
}

function getRowVal(row, tableMeta, col) {
  const info = tableMeta.bySqlName[col.name];
  if (info && info.jsName in row) return row[info.jsName];
  if (col.name in row) return row[col.name];
  return undefined;
}

function flattenSqlChunks(expr) {
  if (!expr || !Array.isArray(expr.queryChunks)) return [];
  return expr.queryChunks;
}

function evalCondition(expr, row, tableMeta) {
  if (!expr) return true;
  const chunks = flattenSqlChunks(expr);
  if (!chunks.length) return true;

  // Strip wrapping parentheses: [StringChunk("("), inner, StringChunk(")")]
  if (
    chunks.length === 3 &&
    Array.isArray(chunks[0]?.value) &&
    chunks[0].value[0] === "(" &&
    Array.isArray(chunks[2]?.value) &&
    chunks[2].value[0] === ")"
  ) {
    return evalCondition(chunks[1], row, tableMeta);
  }

  // Check for top-level " and " / " or " combinators
  const hasAnd = chunks.some((c) => Array.isArray(c?.value) && c.value[0] === " and ");
  if (hasAnd) {
    for (const c of chunks) {
      if (Array.isArray(c?.value)) continue;
      if (!evalCondition(c, row, tableMeta)) return false;
    }
    return true;
  }

  const hasOr = chunks.some((c) => Array.isArray(c?.value) && c.value[0] === " or ");
  if (hasOr) {
    for (const c of chunks) {
      if (Array.isArray(c?.value)) continue;
      if (evalCondition(c, row, tableMeta)) return true;
    }
    return false;
  }

  // Single predicate: extract column, operator text, and param(s)
  let col = null;
  const ops = [];
  const params = [];
  for (const c of chunks) {
    if (c && c.name && c.table) {
      col = c;
    } else if (Array.isArray(c?.value)) {
      const s = c.value.join("").trim();
      if (s) ops.push(s);
    } else if (c && c.constructor && c.constructor.name === "Param") {
      params.push(c.value);
    } else if (Array.isArray(c)) {
      // inArray list of Params
      for (const item of c) {
        if (item && item.constructor && item.constructor.name === "Param") {
          params.push(item.value);
        } else if (item && item.queryChunks) {
          // nested
        } else if (typeof item !== "object") {
          params.push(item);
        }
      }
    } else if (c && Array.isArray(c.queryChunks)) {
      return evalCondition(c, row, tableMeta);
    } else if (c !== undefined && c !== null && typeof c !== "object") {
      params.push(c);
    } else if (c instanceof Date) {
      params.push(c);
    }
  }

  const opStr = ops.join(" ").toLowerCase();
  if (!col) {
    // Handle raw sql like `${users.plan} <> 'free'`
    return true;
  }

  const rowVal = getRowVal(row, tableMeta, col);

  if (opStr.includes("is null")) {
    return rowVal === null || rowVal === undefined;
  }
  if (opStr.includes("is not null")) {
    return rowVal !== null && rowVal !== undefined;
  }
  if (opStr.includes("<> 'free'") || opStr.includes("<>")) {
    const cmp = params.length ? params[0] : "free";
    return rowVal !== cmp;
  }
  if (opStr.includes("in (") || opStr === "in") {
    for (const p of params) assertUuidIfNeeded(col, p);
    return params.includes(rowVal);
  }
  if (opStr.includes("ilike")) {
    const pattern = String(params[0] ?? "");
    const reStr = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    return new RegExp(`^${reStr}$`, "i").test(String(rowVal ?? ""));
  }
  if (opStr.includes(">=")) {
    const p = params[0];
    if (rowVal instanceof Date && p instanceof Date) return rowVal.getTime() >= p.getTime();
    return rowVal >= p;
  }
  if (opStr.includes("<=")) {
    const p = params[0];
    if (rowVal instanceof Date && p instanceof Date) return rowVal.getTime() <= p.getTime();
    return rowVal <= p;
  }
  if (opStr.includes("<")) {
    const p = params[0];
    if (rowVal == null) return false;
    if (rowVal instanceof Date && p instanceof Date) return rowVal.getTime() < p.getTime();
    return rowVal < p;
  }
  if (opStr.includes(">")) {
    const p = params[0];
    if (rowVal == null) return false;
    if (rowVal instanceof Date && p instanceof Date) return rowVal.getTime() > p.getTime();
    return rowVal > p;
  }
  if (opStr.includes("=")) {
    const p = params[0];
    assertUuidIfNeeded(col, p);
    return rowVal === p;
  }
  return true;
}

function applyDefaults(tableName, values) {
  const now = new Date();
  const base = { ...values };
  if (!base.id) base.id = crypto.randomUUID();
  if (!base.createdAt) base.createdAt = now;
  if (!base.updatedAt && tableName !== "signature_events" && tableName !== "activity_logs" && tableName !== "users") {
    base.updatedAt = now;
  }
  if (tableName === "users") {
    if (!base.name) base.name = "مستخدم ميثاق";
    if (!base.plan) base.plan = "free";
    if (base.planExpiresAt === undefined) base.planExpiresAt = null;
    if (base.paidOnce === undefined) base.paidOnce = false;
    if (base.isSingleUsed === undefined) base.isSingleUsed = false;
    if (base.isAdmin === undefined) base.isAdmin = false;
    if (!base.preferences) {
      base.preferences = { darkMode: false, emailNotifications: true, contractReminders: true, language: "ar" };
    }
    if (!base.lastSeenAt) base.lastSeenAt = now;
  }
  if (tableName === "contracts") {
    if (!base.status) base.status = "draft";
    if (!base.signingMode) base.signingMode = "send";
    if (!base.clauses) base.clauses = [];
    if (base.content === undefined) base.content = "";
    if (base.contentHash === undefined) base.contentHash = "";
    if (!base.shareToken) base.shareToken = crypto.randomUUID();
    if (base.sig1DataUrl === undefined) base.sig1DataUrl = null;
    if (base.sig1Name === undefined) base.sig1Name = null;
    if (base.sig1SignedAt === undefined) base.sig1SignedAt = null;
    if (base.sig2DataUrl === undefined) base.sig2DataUrl = null;
    if (base.sig2Name === undefined) base.sig2Name = null;
    if (base.sig2SignedAt === undefined) base.sig2SignedAt = null;
    if (base.party2Email === undefined) base.party2Email = null;
    if (base.party2GoogleId === undefined) base.party2GoogleId = null;
    if (base.favorite === undefined) base.favorite = false;
    if (base.premium === undefined) base.premium = false;
    if (base.reviewStatus === undefined) base.reviewStatus = "none";
  }
  if (tableName === "guest_prompt_seen") {
    if (base.draftsSaved === undefined) base.draftsSaved = 1;
    if (!base.seenAt) base.seenAt = now;
  }
  if (tableName === "transactions") {
    if (!base.status) base.status = "unverified";
    if (base.reviewedAt === undefined) base.reviewedAt = null;
    if (base.reviewedBy === undefined) base.reviewedBy = null;
  }
  if (tableName === "payment_requests") {
    if (!base.status) base.status = "pending";
    if (!base.method) base.method = "usdt";
    if (!base.amountUsd) base.amountUsd = "0";
  }
  return base;
}

export function createMockDb(state) {
  const maybeDelay = async () => {
    if (state.dbDelayMs > 0) {
      await new Promise((r) => setTimeout(r, state.dbDelayMs));
    }
  };

  function makeSelectBuilder(projection) {
    const q = {
      _table: null,
      _joinTable: null,
      _joinCond: null,
      _where: null,
      _orderBy: null,
      _limit: null,
      from(table) {
        q._table = table;
        return q;
      },
      leftJoin(table, cond) {
        q._joinTable = table;
        q._joinCond = cond;
        return q;
      },
      where(cond) {
        q._where = cond;
        return q;
      },
      orderBy(ord) {
        q._orderBy = ord;
        return q;
      },
      limit(n) {
        state.lastLimitArgs.push(n);
        if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n)) {
          const err = new Error(`invalid SQL LIMIT value: ${String(n)}`);
          state.lastSqlErrors.push(err.message);
          q._pendingErr = err;
        }
        q._limit = n;
        return q;
      },
      async _exec() {
        await maybeDelay();
        if (q._pendingErr) throw q._pendingErr;
        const meta = getColMeta(q._table);
        let rows = [...(state.tables[meta.tableName] || [])];
        if (q._where) {
          rows = rows.filter((r) => evalCondition(q._where, r, meta));
        }
        if (q._orderBy) {
          const chunks = flattenSqlChunks(q._orderBy);
          const isDesc = chunks.some((c) => Array.isArray(c?.value) && c.value.join("").toLowerCase().includes("desc"));
          const col = chunks.find((c) => c && c.name && c.table) || q._orderBy;
          if (col && col.name) {
            rows.sort((a, b) => {
              const av = getRowVal(a, meta, col);
              const bv = getRowVal(b, meta, col);
              const an = av instanceof Date ? av.getTime() : av;
              const bn = bv instanceof Date ? bv.getTime() : bv;
              return isDesc ? (bn > an ? 1 : bn < an ? -1 : 0) : (an > bn ? 1 : an < bn ? -1 : 0);
            });
          }
        }
        // Check for count(*) aggregate projection
        if (projection && projection.n && projection.n.queryChunks) {
          return [{ n: rows.length }];
        }
        if (q._limit !== null) {
          rows = rows.slice(0, q._limit);
        }
        if (!projection) return rows.map((r) => ({ ...r }));

        const joinMeta = q._joinTable ? getColMeta(q._joinTable) : null;
        return rows.map((r) => {
          let joined = null;
          if (joinMeta) {
            joined = (state.tables[joinMeta.tableName] || []).find((jr) => jr.id === r.userId) || null;
          }
          const out = {};
          for (const [alias, spec] of Object.entries(projection)) {
            if (spec && spec.name && spec.table) {
              const specTable = spec.table[DRIZZLE_NAME];
              if (specTable === meta.tableName) {
                out[alias] = getRowVal(r, meta, spec);
              } else if (joinMeta && specTable === joinMeta.tableName) {
                out[alias] = joined ? getRowVal(joined, joinMeta, spec) : null;
              }
            } else if (spec && spec.queryChunks) {
              // Subquery e.g. contractsCount
              if (alias === "contractsCount") {
                out[alias] = state.tables.contracts.filter((c) => c.ownerId === r.id).length;
              } else {
                out[alias] = 0;
              }
            }
          }
          return out;
        });
      },
      then(resolve, reject) {
        return q._exec().then(resolve, reject);
      },
    };
    return q;
  }

  function makeInsertBuilder(table) {
    const q = {
      _vals: null,
      _conflict: null,
      _returning: null,
      values(v) {
        q._vals = v;
        return q;
      },
      onConflictDoUpdate(cfg) {
        q._conflict = cfg;
        return q;
      },
      returning(cols) {
        q._returning = cols || true;
        return q;
      },
      async _exec() {
        await maybeDelay();
        const meta = getColMeta(table);
        const list = state.tables[meta.tableName];
        const row = applyDefaults(meta.tableName, q._vals);

        // Enforce UUID checks on UUID columns
        for (const [jsName, col] of Object.entries(meta.cols)) {
          if (row[jsName] !== undefined) assertUuidIfNeeded(col, row[jsName]);
        }

        // Enforce UNIQUE constraints
        if (meta.tableName === "transactions") {
          if (list.some((x) => x.transactionNumber === row.transactionNumber)) {
            const err = new Error("duplicate key value violates unique constraint transactions_transaction_number_unique");
            err.code = "23505";
            throw err;
          }
        }
        if (meta.tableName === "guest_prompt_seen" && q._conflict) {
          const existing = list.find((x) => x.ipHash === row.ipHash);
          if (existing) {
            existing.draftsSaved = (existing.draftsSaved || 1) + 1;
            existing.updatedAt = new Date();
            return q._returning ? [{ ...existing }] : [];
          }
        }

        list.push(row);
        return q._returning ? [{ ...row }] : [];
      },
      then(resolve, reject) {
        return q._exec().then(resolve, reject);
      },
    };
    return q;
  }

  function makeUpdateBuilder(table) {
    const q = {
      _set: null,
      _where: null,
      _returning: null,
      set(v) {
        q._set = v;
        return q;
      },
      where(cond) {
        q._where = cond;
        return q;
      },
      returning(cols) {
        q._returning = cols || true;
        return q;
      },
      async _exec() {
        await maybeDelay();
        const meta = getColMeta(table);
        const list = state.tables[meta.tableName];
        const updated = [];
        for (const row of list) {
          if (!q._where || evalCondition(q._where, row, meta)) {
            for (const [k, v] of Object.entries(q._set || {})) {
              if (v !== undefined) row[k] = v;
            }
            updated.push({ ...row });
          }
        }
        if (!q._returning) return [];
        if (q._returning === true) return updated;
        return updated.map((r) => {
          const out = {};
          for (const [alias, col] of Object.entries(q._returning)) {
            out[alias] = getRowVal(r, meta, col);
          }
          return out;
        });
      },
      then(resolve, reject) {
        return q._exec().then(resolve, reject);
      },
    };
    return q;
  }

  function makeDeleteBuilder(table) {
    const q = {
      _where: null,
      where(cond) {
        q._where = cond;
        return q;
      },
      async _exec() {
        await maybeDelay();
        const meta = getColMeta(table);
        const list = state.tables[meta.tableName];
        const kept = [];
        const removedIds = new Set();
        for (const row of list) {
          if (q._where && evalCondition(q._where, row, meta)) {
            removedIds.add(row.id);
          } else {
            kept.push(row);
          }
        }
        state.tables[meta.tableName] = kept;
        // Simulate ON DELETE CASCADE for signature_events -> contracts
        if (meta.tableName === "contracts" && removedIds.size > 0) {
          state.tables.signature_events = state.tables.signature_events.filter(
            (ev) => !removedIds.has(ev.contractId)
          );
        }
        return [];
      },
      then(resolve, reject) {
        return q._exec().then(resolve, reject);
      },
    };
    return q;
  }

  return {
    select: (proj) => makeSelectBuilder(proj),
    insert: (t) => makeInsertBuilder(t),
    update: (t) => makeUpdateBuilder(t),
    delete: (t) => makeDeleteBuilder(t),
    async batch(queries) {
      const results = [];
      for (const q of queries) results.push(await q._exec());
      return results;
    },
    async execute() {
      await maybeDelay();
      return { rows: [{ "?column?": 1 }] };
    },
  };
}

/* ============================================================
   esbuild Loader — compiles REAL Mithaq API route handlers &
   lib modules into a temporary dir with virtual test doubles
   for @/db, @/lib/auth, and stubs for the missing modules
   (@/lib/admin-guard, @/lib/contract-schema) WITHOUT modifying
   any production file in src/.
   ============================================================ */

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CACHE_BASE = path.join(REPO_ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE_BASE, { recursive: true });
const TMP_DIR = fs.mkdtempSync(path.join(CACHE_BASE, "mithaq-sec-"));

globalThis.__MITHAQ_MOCK_STATE__ = createMockState();
globalThis.__MITHAQ_MOCK_DB__ = createMockDb(globalThis.__MITHAQ_MOCK_STATE__);
globalThis.__MITHAQ_TG_CALLS__ = [];

const virtualPlugin = {
  name: "mithaq-virtual-mocks",
  setup(build) {
    // Map Next.js extensionless subpaths for Node native ESM
    build.onResolve({ filter: /^next\/(server|headers|navigation)$/ }, (args) => ({
      path: args.path + ".js",
      external: true,
    }));
    // Map drizzle-orm & next-auth packages cleanly
    build.onResolve({ filter: /^next-auth$/ }, () => ({
      path: "virtual:next-auth",
      namespace: "mithaq-mock",
    }));
    build.onResolve({ filter: /^next-auth\/providers\/google$/ }, () => ({
      path: "virtual:next-auth-google",
      namespace: "mithaq-mock",
    }));
    // Redirect @/db -> global mock DB
    build.onResolve({ filter: /^@\/db$/ }, () => ({
      path: "virtual:db",
      namespace: "mithaq-mock",
    }));
    // Redirect @/lib/auth -> global mock auth()
    build.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({
      path: "virtual:auth",
      namespace: "mithaq-mock",
    }));
    // Intercept Telegram fetch calls
    build.onResolve({ filter: /^@\/lib\/telegram$/ }, (args) => {
      if (args.importer && args.importer.includes("virtual")) return null;
      return { path: path.join(REPO_ROOT, "src/lib/telegram.ts") };
    });
    // Resolve @/* aliases to src/*
    build.onResolve({ filter: /^@\// }, (args) => {
      const rel = args.path.slice(2);
      const base = path.join(REPO_ROOT, "src", rel);
      for (const candidate of [base + ".ts", base + ".tsx", path.join(base, "index.ts")]) {
        if (fs.existsSync(candidate)) return { path: candidate };
      }
      return null;
    });

    build.onLoad({ filter: /^virtual:next-auth$/, namespace: "mithaq-mock" }, () => ({
      contents: `export default function NextAuth(cfg) { return { auth: () => null, handlers: {}, signIn: () => {}, signOut: () => {}, config: cfg }; }`,
      loader: "js",
    }));
    build.onLoad({ filter: /^virtual:next-auth-google$/, namespace: "mithaq-mock" }, () => ({
      contents: `export default function Google(opts) { return { id: "google", ...opts }; }`,
      loader: "js",
    }));
    build.onLoad({ filter: /^virtual:db$/, namespace: "mithaq-mock" }, () => ({
      contents: `
        export const db = new Proxy({}, {
          get(_target, prop) {
            const cur = globalThis.__MITHAQ_MOCK_DB__;
            const v = cur[prop];
            return typeof v === "function" ? v.bind(cur) : v;
          }
        });
      `,
      loader: "js",
    }));
    build.onLoad({ filter: /^virtual:auth$/, namespace: "mithaq-mock" }, () => ({
      contents: `
        export async function auth() { return globalThis.__MITHAQ_MOCK_STATE__.session; }
        export const adminEmails = () => String(process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
      `,
      loader: "js",
    }));
    build.onLoad({ filter: /^virtual:admin-guard$/, namespace: "mithaq-mock" }, () => ({
      contents: `
        import { eq } from "drizzle-orm";
        import { users } from "@/db/schema";
        export async function isAdminUser(dbId) {
          if (!dbId) return false;
          const rows = await globalThis.__MITHAQ_MOCK_DB__.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, dbId)).limit(1);
          return Boolean(rows[0]?.isAdmin);
        }
        export async function requireAdminSession() {
          const s = globalThis.__MITHAQ_MOCK_STATE__.session;
          if (!s?.user?.dbId) return null;
          const ok = await isAdminUser(s.user.dbId);
          return ok ? s : null;
        }
      `,
      loader: "js",
      resolveDir: REPO_ROOT,
    }));
    build.onLoad({ filter: /^virtual:contract-schema$/, namespace: "mithaq-mock" }, () => ({
      contents: `
        export function parseParty2Email(raw, opts = {}) {
          const v = String(raw ?? "").trim().toLowerCase();
          if (!v) {
            if (opts.required) return { ok: false, message: "بريد الطرف الثاني مطلوب." };
            return { ok: true, email: "" };
          }
          if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v) || v.length > 254) {
            return { ok: false, message: "صيغة بريد الطرف الثاني غير صحيحة." };
          }
          return { ok: true, email: v };
        }
      `,
      loader: "js",
    }));
  },
};

export async function loadRouteModule(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  const outName = relPath.replace(/[^a-zA-Z0-9]/g, "_") + ".mjs";
  const outfile = path.join(TMP_DIR, outName);
  await esbuild.build({
    entryPoints: [abs],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    packages: "external",
    plugins: [virtualPlugin],
    logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
}

export function resetMockState() {
  const fresh = createMockState();
  globalThis.__MITHAQ_MOCK_STATE__ = fresh;
  globalThis.__MITHAQ_MOCK_DB__ = createMockDb(fresh);
  return fresh;
}

export function cleanupTemp() {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
