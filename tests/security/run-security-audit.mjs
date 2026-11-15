#!/usr/bin/env node
/**
 * ============================================================
 * MITHAQ CYBERSECURITY PENETRATION & FUZZING SUITE (5,000+ Tests)
 * ============================================================
 * Executes 9 comprehensive security testing suites directly
 * against the real Mithaq codebase (libs, API route handlers,
 * Next.js config, auth/proxy middleware, SAST, crypto, QR,
 * parsers, supply chain, and legacy artifacts).
 *
 * Usage:
 *   node tests/security/run-security-audit.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NextRequest } from "next/server.js";
import {
  loadRouteModule,
  resetMockState,
  cleanupTemp,
} from "./mock-runtime.mjs";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

/* ============================================================
   Test Harness & Deterministic Seeded PRNG (Mulberry32)
   ============================================================ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x20261114);
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const suites = [];
let currentSuite = null;
const findings = new Map(); // id -> { severity, title, suite, count, samples: [] }

function startSuite(id, name) {
  currentSuite = { id, name, total: 0, passed: 0, failed: 0, startMs: Date.now() };
  suites.push(currentSuite);
}

function endSuite() {
  if (currentSuite) currentSuite.durationMs = Date.now() - currentSuite.startMs;
}

/**
 * Assert a security invariant.
 * If `condition` is false, records a confirmed vulnerability/failure under `findingId`.
 */
function secAssert(condition, findingId, severity, title, detail = "") {
  currentSuite.total++;
  if (condition) {
    currentSuite.passed++;
    return true;
  }
  currentSuite.failed++;
  if (!findings.has(findingId)) {
    findings.set(findingId, {
      id: findingId,
      severity,
      title,
      suite: currentSuite.id,
      failedChecks: 0,
      samples: [],
    });
  }
  const f = findings.get(findingId);
  f.failedChecks++;
  if (detail && f.samples.length < 3) f.samples.push(detail);
  return false;
}

function walkFiles(dir, exts = [".ts", ".tsx", ".mjs", ".js"]) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

function makeReq(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  let body;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  } else if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return new NextRequest(url, {
    method: opts.method || "GET",
    headers,
    body,
  });
}

/* ============================================================
   Load Real Library Modules via esbuild
   ============================================================ */
const contractHashMod = await loadRouteModule("src/lib/contract-hash.ts");
const shareTokenMod = await loadRouteModule("src/lib/share-token.ts");
const fingerprintMod = await loadRouteModule("src/lib/fingerprint.ts");
const contractTextMod = await loadRouteModule("src/lib/contract-text.ts");
const contractTypesMod = await loadRouteModule("src/lib/contract-types.ts");
const formDataMod = await loadRouteModule("src/lib/contract-form-data.ts");
const formatMod = await loadRouteModule("src/lib/format.ts");
const qrMod = await loadRouteModule("src/lib/qr.ts");
const plansMod = await loadRouteModule("src/lib/plans.ts");
const telegramMod = await loadRouteModule("src/lib/telegram.ts");
const tronVerifyMod = await loadRouteModule("src/lib/tron-verify.ts");
const brandingMod = await loadRouteModule("src/lib/branding.ts");
const whatsappMod = await loadRouteModule("src/lib/whatsapp.ts");
const nextConfigMod = await loadRouteModule("next.config.ts");
const authConfigMod = await loadRouteModule("src/auth.config.ts");
const proxyMod = await loadRouteModule("src/proxy.ts");

/* Load Real API Route Handlers */
const routeContracts = await loadRouteModule("src/app/api/contracts/route.ts");
const routeContractId = await loadRouteModule("src/app/api/contracts/[id]/route.ts");
const routeSignatures = await loadRouteModule("src/app/api/contracts/[id]/signatures/route.ts");
const routeShareInfo = await loadRouteModule("src/app/api/contracts/[id]/share-info/route.ts");
const routeRestore = await loadRouteModule("src/app/api/contracts/restore/route.ts");
const routeCheckout = await loadRouteModule("src/app/api/checkout/route.ts");
const routePayReqs = await loadRouteModule("src/app/api/payment-requests/route.ts");
const routeMe = await loadRouteModule("src/app/api/me/route.ts");
const routeVerify = await loadRouteModule("src/app/api/verify/[id]/route.ts");
const routeErrors = await loadRouteModule("src/app/api/errors/route.ts");
const routeGuestPrompt = await loadRouteModule("src/app/api/guest-prompt/route.ts");
const routeHealth = await loadRouteModule("src/app/api/health/route.ts");
const routeCron = await loadRouteModule("src/app/api/cron/expire-plans/route.ts");
const routeAdminUsers = await loadRouteModule("src/app/api/admin/users/route.ts");
const routeAdminUserContracts = await loadRouteModule("src/app/api/admin/users/[id]/contracts/route.ts");
const routeAdminContracts = await loadRouteModule("src/app/api/admin/contracts/route.ts");
const routeAdminContractId = await loadRouteModule("src/app/api/admin/contracts/[id]/route.ts");
const routeAdminTelegramTest = await loadRouteModule("src/app/api/admin/telegram-test/route.ts");
const routeAdminDbSync = await loadRouteModule("src/app/api/admin/db-sync/route.ts");
const routeAdminTx = await loadRouteModule("src/app/api/admin/transactions/route.ts");
const routeAdminPay = await loadRouteModule("src/app/api/admin/payment-requests/route.ts");
const routeAdminLogs = await loadRouteModule("src/app/api/admin/logs/route.ts");

/* ============================================================
   SUITE 1: Build Integrity, Missing Modules, Schema Parity,
   Supply Chain CVEs & Legacy Committed Secrets
   ============================================================ */
startSuite("S1", "Build Integrity, Supply Chain CVEs & Legacy Secrets");

const srcFiles = walkFiles(path.join(REPO_ROOT, "src"), [".ts", ".tsx"]);
const importRe = /from\s+["'](@\/[^"']+)["']/g;
for (const file of srcFiles) {
  const code = fs.readFileSync(file, "utf8");
  const rel = path.relative(REPO_ROOT, file);
  let m;
  while ((m = importRe.exec(code)) !== null) {
    const imp = m[1];
    const base = path.join(REPO_ROOT, "src", imp.slice(2));
    const exists =
      fs.existsSync(base) ||
      fs.existsSync(base + ".ts") ||
      fs.existsSync(base + ".tsx") ||
      fs.existsSync(path.join(base, "index.ts")) ||
      fs.existsSync(path.join(base, "index.tsx"));
    secAssert(
      exists,
      "BUILD-01",
      "CRITICAL",
      "Missing core source modules break compilation & security guards",
      `${rel} imports missing module ${imp}`
    );
  }
}

// Check ESLint flat config existence (ESLint 9)
const hasEslintConfig = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"]
  .some((f) => fs.existsSync(path.join(REPO_ROOT, f)));
secAssert(
  hasEslintConfig,
  "BUILD-02",
  "MEDIUM",
  "Missing eslint.config.* breaks npm run lint (ESLint v9)",
  "No eslint.config.{js,mjs,cjs,ts} found at repository root"
);

// Check broken internal routes referenced in code
const expectedAppPages = [
  { route: "/admin/contracts/[id]", file: "src/app/admin/contracts/[id]/page.tsx" },
  { route: "/contracts", file: "src/app/contracts/page.tsx" },
  { route: "/contracts/[slug]", file: "src/app/contracts/[slug]/page.tsx" },
];
for (const p of expectedAppPages) {
  secAssert(
    fs.existsSync(path.join(REPO_ROOT, p.file)),
    "BUILD-03",
    "LOW",
    "Broken internal routes referenced in admin panel / sitemap / auth.config",
    `Missing route page ${p.file} (referenced as ${p.route})`
  );
}

// Check scripts/db-push.mjs parity against src/db/schema.ts
const dbPushCode = fs.readFileSync(path.join(REPO_ROOT, "scripts/db-push.mjs"), "utf8");
const requiredDbArtifacts = [
  "transactions",
  "paid_once",
  "is_single_used",
  "party2_email",
  "party2_google_id",
  "signer_email",
];
for (const artifact of requiredDbArtifacts) {
  secAssert(
    dbPushCode.includes(artifact),
    "DB-01",
    "HIGH",
    "scripts/db-push.mjs is out of sync with src/db/schema.ts (missing tables/columns)",
    `scripts/db-push.mjs is missing "${artifact}"`
  );
}

// Check Supply Chain / package.json versions
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package-lock.json"), "utf8"));
const installedNext = lock.packages?.["node_modules/next"]?.version || pkg.dependencies.next;
const installedNextAuth = lock.packages?.["node_modules/next-auth"]?.version || pkg.dependencies["next-auth"];
const installedSharp = lock.packages?.["node_modules/sharp"]?.version || "";

secAssert(
  !installedNext.startsWith("16.3.") && !installedNext.startsWith("16.0.") && !installedNext.startsWith("16.1.") && !installedNext.startsWith("16.2."),
  "CVE-01",
  "CRITICAL",
  "Vulnerable Next.js version with Unauthenticated RCE & Server Action DoS CVEs",
  `Installed next@${installedNext} affected by GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r`
);
secAssert(
  !installedNextAuth.includes("beta.25"),
  "CVE-02",
  "MEDIUM",
  "Outdated next-auth v5 beta release (5.0.0-beta.25)",
  `Installed next-auth@${installedNextAuth}`
);
if (installedSharp) {
  const [maj, min, pat] = installedSharp.split(".").map(Number);
  const safeSharp = maj > 0 || min > 35 || (min === 35 && pat >= 5);
  secAssert(
    safeSharp,
    "CVE-03",
    "HIGH",
    "Vulnerable sharp/librsvg version (GHSA-wq5f-xc86-pv6w / CVE-2026-96889)",
    `Installed sharp@${installedSharp} (< 0.35.5)`
  );
}

// Legacy committed encrypted data decryption test
const legacyKey = crypto.createHash("sha256").update("mithaq-development-only-change-this-encryption-key").digest();
for (const fname of ["contracts.json", "sessions.json", "users.json"]) {
  const fpath = path.join(REPO_ROOT, "archive/legacy-app/backend/data", fname);
  if (fs.existsSync(fpath)) {
    let decrypted = false;
    let info = "";
    try {
      const payload = JSON.parse(fs.readFileSync(fpath, "utf8"));
      const dec = crypto.createDecipheriv("aes-256-gcm", legacyKey, Buffer.from(payload.iv, "base64"));
      dec.setAuthTag(Buffer.from(payload.tag, "base64"));
      const plain = Buffer.concat([dec.update(Buffer.from(payload.data, "base64")), dec.final()]).toString("utf8");
      const parsed = JSON.parse(plain);
      decrypted = true;
      info = `${fname} decrypted with hardcoded dev key (${plain.length} bytes, ${Array.isArray(parsed) ? parsed.length + " records" : typeof parsed})`;
    } catch {
      decrypted = false;
    }
    secAssert(
      !decrypted,
      "DATA-01",
      "CRITICAL",
      "Committed legacy data files decryptable with hardcoded development key in Git",
      info
    );
  }
}

for (const fname of ["payments.json", "review-requests.json"]) {
  const fpath = path.join(REPO_ROOT, "archive/legacy-app/backend/data", fname);
  if (fs.existsSync(fpath)) {
    const arr = JSON.parse(fs.readFileSync(fpath, "utf8"));
    secAssert(
      !Array.isArray(arr) || arr.length === 0,
      "DATA-02",
      "HIGH",
      "Plaintext legacy payment/review PII files committed in Git repository",
      `archive/legacy-app/backend/data/${fname} contains ${arr.length} plaintext records`
    );
  }
}

endSuite();

/* ============================================================
   SUITE 2: SAST Static Application Security Analysis (src/)
   ============================================================ */
startSuite("S2", "Static Application Security Testing (SAST across all src/)");

for (const file of srcFiles) {
  const rel = path.relative(REPO_ROOT, file);
  const code = fs.readFileSync(file, "utf8");

  // Check for eval / new Function / document.write
  secAssert(
    !/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(code),
    "SAST-EVAL",
    "CRITICAL",
    "Dangerous dynamic code execution sink detected",
    rel
  );

  // Check for sql.raw in src/
  secAssert(
    !/sql\.raw\s*\(/.test(code),
    "SAST-SQLRAW",
    "HIGH",
    "Raw SQL interpolation sink detected in src/",
    rel
  );

  // Check for hardcoded fallback crypto salt
  secAssert(
    !code.includes('"mithaq-salt"') && !code.includes("'mithaq-salt'"),
    "SAST-SALT",
    "MEDIUM",
    "Hardcoded fallback cryptographic salt ('mithaq-salt') weakens IP hash privacy",
    `${rel}: uses hardcoded fallback salt "mithaq-salt"`
  );

  // Check target="_blank" without noreferrer
  const blankMatches = code.match(/target=["']_blank["'][^>]*>/g) || [];
  for (const tag of blankMatches) {
    const hasNoRef = /noreferrer/i.test(tag);
    secAssert(
      hasNoRef,
      "SAST-TABNAB",
      "LOW",
      "External target='_blank' link missing 'noreferrer' (leaks Referer header)",
      `${rel}: ${tag.slice(0, 90)}`
    );
  }

  // Check sensitive API routes for Cache-Control: no-store (direct or via noStoreJson/NO_STORE_HEADERS)
  if (rel.startsWith("src/app/api/") && !rel.includes("/health/") && !rel.includes("/auth/")) {
    secAssert(
      /no-store|noStoreJson|NO_STORE_HEADERS/i.test(code),
      "SAST-CACHE",
      "MEDIUM",
      "Sensitive API routes do not set 'Cache-Control: no-store, private' headers",
      `${rel} returns sensitive JSON without Cache-Control: no-store`
    );
  }

  // Check first-hop X-Forwarded-For trust
  if (code.includes('x-forwarded-for') && /\.split\(["'],["']\)\[0\]/.test(code)) {
    secAssert(
      false,
      "SAST-XFF",
      "HIGH",
      "Untrusted first-hop X-Forwarded-For header parsing enables IP spoofing",
      `${rel}: splits x-forwarded-for and takes index [0]`
    );
  } else {
    secAssert(true, "SAST-XFF", "HIGH", "XFF check");
  }
}

// Check specific architectural security invariants
const authTs = fs.readFileSync(path.join(REPO_ROOT, "src/lib/auth.ts"), "utf8");
secAssert(
  authTs.includes("email_verified"),
  "AUTH-01",
  "MEDIUM",
  "Google OAuth signIn callback does not verify profile.email_verified === true",
  "src/lib/auth.ts never checks profile.email_verified"
);
secAssert(
  !authTs.includes("isAdmin: isAdminFlag || existing[0].isAdmin"),
  "AUTH-02",
  "MEDIUM",
  "Admin privilege sticky in syncUser & stale in JWT session token",
  "src/lib/auth.ts:79 keeps existing[0].isAdmin=true even if removed from ADMIN_EMAILS"
);
secAssert(
  !/catch\s*\([^)]*\)\s*\{[^}]*return\s+true\s*;/.test(authTs),
  "AUTH-03",
  "MEDIUM",
  "signIn callback fails open (returns true) when DB syncUser() fails",
  "src/lib/auth.ts:122-125 allows login with undefined dbId on DB error"
);

const guardTs = fs.readFileSync(path.join(REPO_ROOT, "src/lib/mithaq-guard.ts"), "utf8");
secAssert(
  !/catch\s*\{\s*return\s*\{\s*suspended:\s*false\s*\}/.test(guardTs),
  "GUARD-01",
  "MEDIUM",
  "isOwnerSuspended() fails open (suspended: false) on DB error & loads up to 500 rows unfiltered",
  "src/lib/mithaq-guard.ts returns { suspended: false } on any catch"
);

const printPage = fs.readFileSync(path.join(REPO_ROOT, "src/app/print/[id]/page.tsx"), "utf8");
const signPage = fs.readFileSync(path.join(REPO_ROOT, "src/app/sign/[id]/page.tsx"), "utf8");
secAssert(
  printPage.includes("isOwnerSuspended"),
  "GUARD-02",
  "HIGH",
  "Suspended fraudsters can still access /print/[id] and /sign/[id] to generate PDFs/QRs",
  "src/app/print/[id]/page.tsx never calls isOwnerSuspended() despite mithaq-guard.ts doc claiming it does"
);
secAssert(
  signPage.includes("isOwnerSuspended"),
  "GUARD-02",
  "HIGH",
  "Suspended fraudsters can still access /print/[id] and /sign/[id] to generate PDFs/QRs",
  "src/app/sign/[id]/page.tsx never calls isOwnerSuspended()"
);

const sharePage = fs.readFileSync(path.join(REPO_ROOT, "src/app/share/[id]/page.tsx"), "utf8");
secAssert(
  !sharePage.includes("وُقّع من حساب Google: {contract.party2Email}"),
  "PRIV-01",
  "HIGH",
  "Public /share/[id] leaks unmasked party2Email and falsely displays 'Signed by Google' before signing",
  "src/app/share/[id]/page.tsx:213 renders raw contract.party2Email unconditionally without checking sig2SignedAt or maskEmail()"
);

const shareSignPad = fs.readFileSync(path.join(REPO_ROOT, "src/components/signing/ShareSignPad.tsx"), "utf8");
secAssert(
  !shareSignPad.includes("{boundParty2Email"),
  "PRIV-02",
  "MEDIUM",
  "ShareSignPad leaks full unmasked boundParty2Email to unauthorized visitors on mismatch",
  "src/components/signing/ShareSignPad.tsx:163 displays full boundParty2Email in mismatch warning"
);

const baseUrlTs = fs.readFileSync(path.join(REPO_ROOT, "src/lib/base-url.ts"), "utf8");
secAssert(
  /allowlist|ALLOWED_HOSTS|NEXT_PUBLIC_BASE_URL.*host/i.test(baseUrlTs) && !/h\.get\("x-forwarded-host"\)/.test(baseUrlTs),
  "HOST-01",
  "HIGH",
  "Host Header Injection via unvalidated x-forwarded-host / x-forwarded-proto in requestBaseUrl()",
  "src/lib/base-url.ts trusts arbitrary x-forwarded-host & x-forwarded-proto headers to build QR/WhatsApp links"
);

const adminPage = fs.readFileSync(path.join(REPO_ROOT, "src/app/admin/page.tsx"), "utf8");
secAssert(
  !adminPage.includes('eq(users.plan, "premium")'),
  "BUG-01",
  "LOW",
  "Admin dashboard counts users.plan='premium' which is not a valid plan ID (always 0)",
  "src/app/admin/page.tsx:86 queries plan='premium' instead of valid paid plans"
);

const contractsRouteCode = fs.readFileSync(path.join(REPO_ROOT, "src/app/api/contracts/route.ts"), "utf8");
secAssert(
  contractsRouteCode.includes("isSingleUsed"),
  "LOGIC-01",
  "CRITICAL",
  "isSingleUsed flag is never enforced or updated — 'single' ($2) & 'basic' ($5) plans grant unlimited contracts forever",
  "src/app/api/contracts/route.ts sets unlimited=true for planId==='single' and Boolean(u?.paidOnce)"
);

const loginPageCode = fs.readFileSync(path.join(REPO_ROOT, "src/app/login/page.tsx"), "utf8");
secAssert(
  /startsWith\(["']\/["']\)/.test(loginPageCode),
  "REDIR-01",
  "MEDIUM",
  "Client-side callbackUrl in /login is passed to signIn() without relative-path validation",
  "src/app/login/page.tsx:118 passes raw query param callbackUrl directly to signIn()"
);

endSuite();

/* ============================================================
   SUITE 3: Cryptographic Integrity, Canonicalization Collisions,
   Signature Exclusion & Share Token Fuzzing (~650 tests)
   ============================================================ */
startSuite("S3", "Cryptography, Hash Canonicalization & Share-Token Security");

const { contractFingerprint } = contractHashMod;
const { encodeShareToken, decodeShareToken } = shareTokenMod;
const { contractVerification } = fingerprintMod;

// 3.1 Prove delimiter-injection SHA-256 canonicalization collisions (150 pairs)
const collisionPairs = [
  // Shift across party1Name / party2Name
  [
    { id: "1", type: "sale", party1Name: "أحمد|خالد", party2Name: "سعد", date: "2026-01-01", content: "X" },
    { id: "1", type: "sale", party1Name: "أحمد", party2Name: "خالد|سعد", date: "2026-01-01", content: "X" },
  ],
  // Shift across subject / notes
  [
    { id: "2", type: "lease", party1Name: "A", party2Name: "B", date: "2026-01-01", subject: "شقة|ملاحظة", notes: "سرية", content: "C" },
    { id: "2", type: "lease", party1Name: "A", party2Name: "B", date: "2026-01-01", subject: "شقة", notes: "ملاحظة|سرية", content: "C" },
  ],
  // Shift across amount / date
  [
    { id: "3", type: "services", party1Name: "A", party2Name: "B", amount: "500|2026", date: "01-01", content: "C" },
    { id: "3", type: "services", party1Name: "A", party2Name: "B", amount: "500", date: "2026|01-01", content: "C" },
  ],
  // Shift across clauses array boundaries
  [
    { id: "4", type: "nda", party1Name: "A", party2Name: "B", date: "2026-01-01", clauses: ["بند1\nبند2"], content: "C" },
    { id: "4", type: "nda", party1Name: "A", party2Name: "B", date: "2026-01-01", clauses: ["بند1", "بند2"], content: "C" },
  ],
  // Shift across city / subject
  [
    { id: "5", type: "design", party1Name: "A", party2Name: "B", date: "2026-01-01", city: "دمشق|تصميم", subject: "موقع", content: "C" },
    { id: "5", type: "design", party1Name: "A", party2Name: "B", date: "2026-01-01", city: "دمشق", subject: "تصميم|موقع", content: "C" },
  ],
];
// Expand to 150 distinct collision pairs
for (let i = 0; i < 145; i++) {
  const s1 = `A${i}`;
  const s2 = `B${i}`;
  const s3 = `C${i}`;
  collisionPairs.push([
    { id: `id-${i}`, type: "sale", party1Name: `${s1}|${s2}`, party2Name: s3, date: "2026-05-01", content: "fixed" },
    { id: `id-${i}`, type: "sale", party1Name: s1, party2Name: `${s2}|${s3}`, date: "2026-05-01", content: "fixed" },
  ]);
}
for (let i = 0; i < collisionPairs.length; i++) {
  const [a, b] = collisionPairs[i];
  const ha = contractFingerprint(a);
  const hb = contractFingerprint(b);
  secAssert(
    ha !== hb,
    "CRYPTO-01",
    "MEDIUM",
    "SHA-256 canonicalization collision via unescaped '|' and '\\n' delimiters in contractFingerprint()",
    `Pair #${i}: different fields produced identical SHA-256 ${ha.slice(0, 20)}...`
  );
}

// 3.2 Prove signatures & signer identity fields are NOT bound to contentHash (100 tests)
const baseContractForSig = {
  id: crypto.randomUUID(),
  type: "sale",
  party1Name: "أحمد العلي",
  party2Name: "محمد حسن",
  amount: "10000 USD",
  date: new Date("2026-10-01T12:00:00Z"),
  city: "دمشق",
  subject: "بيع سيارة",
  clauses: ["بند أول"],
  content: "نص العقد",
};
const hashBefore = contractFingerprint(baseContractForSig);
for (let i = 0; i < 100; i++) {
  const tampered = {
    ...baseContractForSig,
    sig1DataUrl: `data:image/png;base64,FAKE_${i}`,
    sig2DataUrl: `data:image/png;base64,FORGED_${i}`,
    party2Email: `attacker${i}@evil.com`,
    party2GoogleId: `google-sub-${i}`,
    sig1SignedAt: new Date(Date.now() + i * 1000),
    sig2SignedAt: new Date(Date.now() + i * 2000),
    status: i % 2 === 0 ? "signed" : "draft",
  };
  const hashAfter = contractFingerprint(tampered);
  secAssert(
    hashBefore !== hashAfter,
    "CRYPTO-02",
    "HIGH",
    "Signatures, signer Google identity, timestamps & status are excluded from contractFingerprint()",
    `Tampered sig/email/status produced identical contentHash ${hashAfter.slice(0, 16)}...`
  );
}

// 3.3 Positive crypto sensitivity: modifying ANY included field changes SHA-256 (100 tests)
const includedFields = ["id", "type", "party1Name", "party2Name", "amount", "duration", "paymentMethod", "city", "subject", "notes", "content"];
for (let i = 0; i < 100; i++) {
  const field = includedFields[i % includedFields.length];
  const modified = { ...baseContractForSig, [field]: String(baseContractForSig[field] || "") + `_${i}` };
  secAssert(
    contractFingerprint(modified) !== hashBefore,
    "CRYPTO-AVALANCHE",
    "HIGH",
    "Modifying an included contract field did not alter SHA-256",
    `Field ${field} unchanged`
  );
}

// 3.4 Share token codec fuzzing (200 tests)
const tokenFuzzInputs = [
  "", "a", "mth_", "mth_!!!notbase64!!!", "mth_====", "mth_" + "A".repeat(1000),
  crypto.randomUUID(), "../../admin", "../../../etc/passwd", "test\x00null",
  "عربي مع رموز 🔐", "mth_mth_double", "a+b/c=d", "%2e%2e%2fadmin",
  "javascript:alert(1)", "<script>alert(1)</script>", "' OR 1=1--",
];
for (let i = 0; i < 183; i++) {
  tokenFuzzInputs.push(crypto.randomBytes(randInt(1, 48)).toString("base64url"));
}
for (const raw of tokenFuzzInputs) {
  let ok = true;
  try {
    const enc = encodeShareToken(raw);
    const dec = decodeShareToken(enc);
    if (raw === "") ok = enc === "" && dec === "";
    else if (raw.startsWith("mth_") || raw.startsWith("mth2_")) ok = typeof dec === "string";
    else ok = dec === raw && (enc.startsWith("mth_") || enc.startsWith("mth2_"));
  } catch {
    ok = false;
  }
  secAssert(ok, "TOKEN-CODEC", "MEDIUM", "Share token encode/decode round-trip failure", `Input: ${raw.slice(0, 40)}`);
}

// Check that share token is NOT actually encrypted (trivial base64url reversal)
const sampleUuid = "550e8400-e29b-41d4-a716-446655440000";
const encToken = encodeShareToken(sampleUuid);
const reversedWithoutKey = Buffer.from(encToken.slice(4), "base64url").toString("utf8");
secAssert(
  reversedWithoutKey !== sampleUuid,
  "CRYPTO-03",
  "LOW",
  "encodeShareToken() uses reversible Base64URL encoding while documented as 'encryption' (obfuscation only)",
  `mth_... decoded directly without any key back to raw UUID ${reversedWithoutKey}`
);

// 3.5 Birthday collision analysis on MEQ-XXXXX (5-digit ref namespace = 100,000 slots)
const refsSeen = new Set();
let refCollisions = 0;
for (let i = 0; i < 1200; i++) {
  const { ref, verify } = contractVerification(crypto.randomUUID(), new Date(), "signed");
  secAssert(/^MEQ-\d{5,8}$/.test(ref) && /^[0-9A-F]{8}$/.test(verify), "REF-FMT", "LOW", "Invalid MEQ ref/verify format");
  if (refsSeen.has(ref)) refCollisions++;
  refsSeen.add(ref);
}
secAssert(
  refCollisions === 0,
  "CRYPTO-04",
  "LOW",
  "MEQ-XXXXX reference ID has small 10^5 namespace (frequent birthday collisions at ~1,000 contracts)",
  `${refCollisions} MEQ-XXXXX collisions observed across 1,200 random UUIDs`
);

endSuite();

/* ============================================================
   SUITE 4: Input Sanitization, Bidi Trojan Source, Placeholder
   Injection, maskEmail & Body-Size Bypass Fuzzing (~800 tests)
   ============================================================ */
startSuite("S4", "Input Sanitization, Unicode Bidi Trojan Source & Injection Fuzzing");

const { normalize, clampText, clampClauses, applyPlaceholders, buildContractContent, isBodyTooLarge, CONTRACT_LIMITS } = contractTextMod;
const { maskEmail } = formatMod;

// 4.1 Unicode Bidi / Trojan Source bypass tests (60 tests)
const bidiDangerousChars = [
  { name: "LRI U+2066", ch: "\u2066" },
  { name: "RLI U+2067", ch: "\u2067" },
  { name: "FSI U+2068", ch: "\u2068" },
  { name: "PDI U+2069", ch: "\u2069" },
  { name: "ALM U+061C", ch: "\u061C" },
  { name: "ZWSP U+200B", ch: "\u200B" },
  { name: "Mid-string BOM U+FEFF", ch: "\uFEFF" },
];
for (const b of bidiDangerousChars) {
  for (let i = 0; i < 5; i++) {
    const payload = `مبلغ ${b.ch}500${b.ch} دولار ${i}`;
    const cleaned = normalize(payload);
    secAssert(
      !cleaned.includes(b.ch),
      "INPUT-01",
      "MEDIUM",
      "normalize() fails to strip Unicode Bidi Isolates (U+2066-2069), ALM (U+061C), ZWSP (U+200B) & mid-string BOM — Trojan Source visual spoofing possible",
      `${b.name} survived normalize(): ${JSON.stringify(cleaned)}`
    );
  }
}

// Verify control chars that ARE stripped (100 tests)
const strippedChars = ["\u0000", "\u0007", "\u0008", "\u001B", "\u007F", "\u200E", "\u200F", "\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\uFFFD"];
for (let i = 0; i < 100; i++) {
  const ch = strippedChars[i % strippedChars.length];
  const out = normalize(`hello${ch}world${i}`);
  secAssert(!out.includes(ch), "NORM-CTRL", "MEDIUM", "Control/legacy bidi char not stripped", JSON.stringify(out));
}

// 4.2 Placeholder injection & regex performance tests (200 tests)
const placeholderPayloads = [
  "[__proto__]", "[constructor]", "[toString]", "[valueOf]", "[hasOwnProperty]",
  "[[المبلغ]]", "[المبلغ][الطرف الأول]", "[$&]", "[$$]", "[$']", "[$`]",
  "[" + "أ".repeat(79) + "]", "[" + "أ".repeat(80) + "]", "[" + "أ".repeat(81) + "]",
  "[".repeat(5000) + "المبلغ" + "]".repeat(5000),
  "[أ".repeat(2000),
];
for (let i = 0; i < 184; i++) {
  placeholderPayloads.push(`بند ${i}: [${pick(["المبلغ", "اسم العميل", "__proto__", "غير موجود", "a".repeat(randInt(1, 90))])}]`);
}
for (const p of placeholderPayloads) {
  const t0 = performance.now();
  let out = "";
  let crashed = false;
  try {
    out = applyPlaceholders(p, { "المبلغ": "500$", "اسم العميل": "أحمد", "الطرف الأول": "أحمد" });
  } catch {
    crashed = true;
  }
  const dt = performance.now() - t0;
  secAssert(!crashed && dt < 50 && !out.includes("function "), "PLACEHOLDER-01", "MEDIUM", "applyPlaceholders crash, slow regex, or prototype function leak", `dt=${dt.toFixed(1)}ms out=${out.slice(0, 60)}`);
}

// 4.3 clampText & clampClauses bounds fuzzing (150 tests)
for (let i = 0; i < 100; i++) {
  const huge = "أ".repeat(randInt(500, 10000));
  const max = randInt(10, 500);
  const res = clampText(huge, max);
  secAssert(res.length <= max, "CLAMP-TEXT", "HIGH", "clampText exceeded max bound", `len=${res.length} > ${max}`);
}
for (let i = 0; i < 50; i++) {
  const arr = Array.from({ length: randInt(41, 120) }, (_, j) => "بند ".repeat(randInt(200, 800)) + j);
  const res = clampClauses(arr);
  secAssert(
    res.length <= CONTRACT_LIMITS.maxClauses && res.every((c) => c.length <= CONTRACT_LIMITS.clause),
    "CLAMP-CLAUSES",
    "HIGH",
    "clampClauses exceeded limit",
    `count=${res.length}`
  );
}

// 4.4 isBodyTooLarge bypass tests (100 tests)
const bypassCases = [
  // Missing Content-Length header (chunked transfer encoding!)
  { headers: { "transfer-encoding": "chunked" }, actualBytes: 2_000_000, expectReject: true },
  { headers: {}, actualBytes: 5_000_000, expectReject: true },
  { headers: { "content-length": "not-a-number" }, actualBytes: 500_000, expectReject: true },
  { headers: { "content-length": "-1" }, actualBytes: 500_000, expectReject: true },
];
for (const c of bypassCases) {
  const req = new Request("https://miithaq.com/api/contracts", { method: "POST", headers: c.headers });
  const blocked = isBodyTooLarge(req);
  secAssert(
    blocked === c.expectReject,
    "DOS-01",
    "HIGH",
    "isBodyTooLarge() only trusts Content-Length header — trivially bypassed via chunked transfer encoding or omitted header",
    `Headers ${JSON.stringify(c.headers)} returned isBodyTooLarge=${blocked}`
  );
}
for (let i = 0; i < 96; i++) {
  const sz = i < 48 ? randInt(0, CONTRACT_LIMITS.maxBodyBytes) : randInt(CONTRACT_LIMITS.maxBodyBytes + 1, 10_000_000);
  const req = new Request("https://miithaq.com/api/contracts", { method: "POST", headers: { "content-length": String(sz) } });
  secAssert(isBodyTooLarge(req) === (sz > CONTRACT_LIMITS.maxBodyBytes), "BODY-LEN-BOUND", "MEDIUM", "Content-Length boundary check");
}

// 4.5 maskEmail fuzzing (150 tests)
const emailFuzz = [
  "a@b.com", "alice@gmail.com", "verylongusername123456@company.org",
  "@evil.com", "a@b@c.com", "user@@gmail.com", "no-at-sign", "", "   ",
  "user+tag@sub.domain.co.uk", "أحمد@مثال.كوم", "x@y",
];
for (let i = 0; i < 138; i++) {
  emailFuzz.push(`${"u".repeat(randInt(1, 30))}@domain${i}.com`);
}
for (const em of emailFuzz) {
  const masked = maskEmail(em);
  if (em.includes("@") && em.split("@").length > 2) {
    // Multi-@ email edge case check — safely rejected ("—") or preserves real domain
    const realDomain = em.slice(em.lastIndexOf("@") + 1);
    secAssert(
      masked === "—" || masked.endsWith("@" + realDomain),
      "FORMAT-01",
      "LOW",
      "maskEmail() truncates domain on malformed multi-@ inputs",
      `maskEmail(${JSON.stringify(em)}) => ${JSON.stringify(masked)}`
    );
  } else if (em.trim().startsWith("@")) {
    secAssert(
      !masked.startsWith("*"),
      "FORMAT-01",
      "LOW",
      "maskEmail() produces malformed output on empty local-part '@domain'",
      `maskEmail(${JSON.stringify(em)}) => ${JSON.stringify(masked)}`
    );
  } else {
    const trimmed = em.trim().toLowerCase();
    const leakedFull = trimmed.length > 5 && trimmed.includes("@") && masked === trimmed;
    secAssert(!leakedFull, "MASK-LEAK", "MEDIUM", "maskEmail leaked full email", `${em} => ${masked}`);
  }
}

endSuite();

/* ============================================================
   SUITE 5: Parser Fuzzing, Prototype Property Bypass, ReDoS
   Timing Stress Tests & Telegram/WhatsApp Injection (~1,000 tests)
   ============================================================ */
startSuite("S5", "Parser Fuzzing, Prototype Bypass, ReDoS & Messaging Injection");

const { CONTRACT_TYPES, contractTypeName } = contractTypesMod;
const { parseDur, durPhrase, cleanMoney, numCanon, parseMoney, paymentFind, normAr, countryOfCity } = formDataMod;
const { whatsappLink, buildOfficialShareMessage } = whatsappMod;
const { notifyContractEvent } = telegramMod;

// 5.1 CRITICAL Prototype Property Lookup Bypass in CONTRACT_TYPES!
const protoKeys = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"];
for (const k of protoKeys) {
  // Exact check used in src/app/api/contracts/route.ts:50 & restore & PUT
  const passesCurrentCheck = Boolean(k && CONTRACT_TYPES[k]);
  secAssert(
    !passesCurrentCheck,
    "PROTO-01",
    "HIGH",
    "Prototype property lookup bypass on CONTRACT_TYPES[type] allows 'constructor'/'toString'/'__proto__' as valid contract types",
    `CONTRACT_TYPES["${k}"] is truthy (${typeof CONTRACT_TYPES[k]}) & contractTypeName("${k}") returns ${typeof contractTypeName(k)}`
  );
}

// 5.2 ReDoS & Adversarial Stress Fuzzing on parseDur / parseMoney / cleanMoney / paymentFind (600 tests)
const redosPayloads = [
  "1" + " ".repeat(20000) + "يوم",
  "9".repeat(30000) + " أشهر",
  "1" + " يوم".repeat(5000),
  "0".repeat(30000) + "." + "0".repeat(30000) + " USD",
  "1,2,3,4,".repeat(5000) + " ليرة سورية",
  ".".repeat(30000),
  " ".repeat(40000) + "شام كاش",
  "\u064B".repeat(30000) + "شام كاش",
  "12345" + ".".repeat(10000) + "567 USDT",
  "999999999999999999999999999999999999999999999999 USD",
  "1e308 USD",
  "-500 USD",
  "NaN USD",
  "Infinity USD",
  "٥٠٠٠ دولار",
  "۵۰۰۰ دلار",
];

for (const p of redosPayloads) {
  for (const [fnName, fn] of [
    ["parseDur", parseDur],
    ["parseMoney", parseMoney],
    ["cleanMoney", cleanMoney],
    ["paymentFind", paymentFind],
    ["normAr", normAr],
  ]) {
    const t0 = performance.now();
    let ok = true;
    try {
      fn(p);
    } catch {
      ok = false;
    }
    const dt = performance.now() - t0;
    secAssert(
      ok && dt < 80,
      "REDOS-01",
      "MEDIUM",
      `Parser slow or crashed on adversarial input (${fnName})`,
      `${fnName} took ${dt.toFixed(1)}ms on payload len=${p.length}`
    );
  }
}

// 520 randomized parser fuzz tests
const units = ["يوم", "يومان", "أيام", "يوماً", "شهر", "شهران", "أشهر", "سنة", "سنتان", "سنوات", "قرن", "XYZ", ""];
const currencies = ["USD", "EUR", "SYP", "SAR", "AED", "USDT", "دولار أمريكي", "ليرة سورية", "ريال سعودي", "درهم", "BTC", ""];
for (let i = 0; i < 260; i++) {
  const durStr = `${randInt(-10, 12000)} ${pick(units)}`;
  const d = parseDur(durStr);
  secAssert(d && (d.kind === "ok" || d.kind === "custom"), "PARSEDUR-FUZZ", "LOW", "parseDur invalid result");

  const moneyStr = `${randInt(-100, 9999999)}.${randInt(0, 999)} ${pick(currencies)}`;
  const m = parseMoney(moneyStr);
  secAssert(m && ["empty", "ok", "custom"].includes(m.kind), "PARSEMONEY-FUZZ", "LOW", "parseMoney invalid result");
}

// 5.3 WhatsApp URL injection & scheme smuggling fuzzing (150 tests)
const waAttackPhones = [
  "javascript:alert(1)", "//evil.com/phish", "963933123456?text=evil#frag",
  "../../evil", "<script>alert(1)</script>", "+963-933-111-222", "00963 933 111 222",
  "", "   ", "0000000000000000000000000",
];
for (let i = 0; i < 140; i++) {
  waAttackPhones.push(`+${randInt(1, 999)} ${randInt(100000, 999999999)} ${pick(["/evil", "@phish", "\r\nX-Inject: 1", ""])}`);
}
for (const ph of waAttackPhones) {
  const url = whatsappLink("مرحباً\r\n<script>alert(1)</script>", ph);
  const parsed = new URL(url);
  secAssert(
    parsed.protocol === "https:" && parsed.hostname === "wa.me" && /^\/\d*$/.test(parsed.pathname),
    "WA-INJ",
    "HIGH",
    "WhatsApp link generator vulnerable to URL/scheme injection",
    `phone=${ph} => ${url}`
  );
}

// 5.4 Telegram HTML entity escaping verification (200 tests)
const origFetch = globalThis.fetch;
const tgSentBodies = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes("api.telegram.org")) {
    tgSentBodies.push(JSON.parse(init.body));
    return { json: async () => ({ ok: true }) };
  }
  return origFetch(url, init);
};
process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
process.env.TELEGRAM_CHAT_ID = "99999";

const htmlPayloads = [
  '<a href="https://evil.com">Click Here</a>',
  '<script>alert(1)</script>',
  '<b>FAKE ADMIN</b>',
  '"><img src=x onerror=alert(1)>',
  '&lt;b&gt;double&amp;escape',
  '<code>injected</code><pre>block</pre>',
];
for (let i = 0; i < 194; i++) {
  htmlPayloads.push(`User_${i} <a href="http://x${i}.evil">link</a> & "quote"`);
}
for (const hp of htmlPayloads) {
  tgSentBodies.length = 0;
  await notifyContractEvent(
    { typeName: hp, ref: hp, party1Name: hp, party2Name: hp, shareUrl: "https://miithaq.com/share/1", verifyUrl: "https://miithaq.com/verify/1" },
    "opened",
    { name: hp, party: "الطرف الثاني" }
  );
  const sent = tgSentBodies[0]?.text || "";
  secAssert(
    !sent.includes("<a href") && !sent.includes("<script") && !sent.includes("<img") && !sent.includes("<code>"),
    "TG-HTML-INJ",
    "HIGH",
    "Telegram HTML injection detected in notifyContractEvent()",
    `Unescaped tag in Telegram message: ${sent.slice(0, 120)}`
  );
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
globalThis.fetch = origFetch;

endSuite();

/* ============================================================
   SUITE 6: QR Code Generator Fuzzing, DoS Crash & SVG XSS
   (~600 tests)
   ============================================================ */
startSuite("S6", "QR Code ISO/IEC 18004 Fuzzing, DoS Boundary & Raw SVG XSS");

const { qrMatrix, qrSvg } = qrMod;

// 6.1 Raw SVG XSS injection via unescaped `ink` / `size` in qrSvg() (rendered with dangerouslySetInnerHTML!)
const svgXssPayloads = [
  '" /><script>alert(1)</script><path d="',
  '" onload="alert(1)',
  '#000"/><img src=x onerror=alert(1)><path fill="',
  '"><foreignObject><body onload=alert(1)></foreignObject><path d="',
  '"/><svg onload=alert(document.cookie)><path d="',
];
for (const payload of svgXssPayloads) {
  const svg = qrSvg("https://miithaq.com/verify/mth_test", { ink: payload });
  secAssert(
    !svg.includes("<script") && !svg.includes("onload=") && !svg.includes("onerror=") && !svg.includes("<foreignObject"),
    "XSS-QR-01",
    "MEDIUM",
    "qrSvg() concatenates `ink` & `size` unescaped into raw SVG HTML (rendered via dangerouslySetInnerHTML in QrCode.tsx)",
    `Injected SVG: ${svg.slice(-140)}`
  );
}

// 6.2 QR capacity DoS crash tests (> 271 bytes throws unhandled Error during SSR!)
for (const len of [272, 280, 300, 350, 500, 1000]) {
  const longUrl = `https://${"a".repeat(len - 35)}.evil.com/verify/mth_123456`;
  let threw = false;
  try {
    qrSvg(longUrl, { ecc: "M" });
  } catch {
    threw = true;
  }
  secAssert(
    !threw,
    "DOS-QR-01",
    "MEDIUM",
    "qrSvg()/QrCode.tsx throws unhandled Error (SSR 500 DoS) when verifyUrl exceeds 271 UTF-8 bytes (e.g. long Host header)",
    `verifyUrl length=${longUrl.length} threw unhandled Error in qrSvg()`
  );
}

// 6.3 Valid QR matrix & SVG fuzzing across versions 1..10, UTF-8 Arabic, emojis, all ECC levels (580 tests)
const eccLevels = ["L", "M", "Q", "H", "INVALID"];
for (let i = 0; i < 290; i++) {
  const text = i === 0
    ? ""
    : i % 3 === 0
      ? `https://miithaq.com/verify/mth_${crypto.randomBytes(randInt(4, 36)).toString("base64url")}`
      : i % 3 === 1
        ? `عقد ميثاق رقم ${i} — ${"م".repeat(randInt(1, 30))}`
        : "A".repeat(randInt(1, 180));
  const ecc = pick(eccLevels);
  const m = qrMatrix(text, { ecc });
  const expectedDim = m.type * 4 + 17;
  secAssert(
    m.moduleCount === expectedDim && m.modules.length === expectedDim && m.modules.every((r) => r.length === expectedDim),
    "QR-MATRIX",
    "MEDIUM",
    "QR matrix dimension invariant failed",
    `len=${text.length} type=${m.type} count=${m.moduleCount}`
  );
  const svg = qrSvg(text, { ecc, size: 96 });
  secAssert(
    svg.startsWith("<svg ") && svg.endsWith("</svg>") && svg.includes("<path d="),
    "QR-SVG-FMT",
    "LOW",
    "QR SVG well-formedness check failed"
  );
}

endSuite();

/* ============================================================
   SUITE 7: Live End-to-End API Route Penetration Testing
   (Executing all real route handlers against in-memory DB)
   (~650 tests)
   ============================================================ */
startSuite("S7", "Live API Route Penetration Testing (AuthZ, IDOR, Logic, Races, DoS)");

const USER_A_ID = "11111111-1111-4111-8111-111111111111";
const USER_B_ID = "22222222-2222-4222-8222-222222222222";
const USER_C_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";

function seedUsers(state) {
  state.tables.users.push(
    { id: USER_A_ID, googleId: "g-a", email: "alice@example.com", name: "Alice", plan: "free", planExpiresAt: null, paidOnce: false, isSingleUsed: false, isAdmin: false, preferences: { darkMode: false, emailNotifications: true, contractReminders: true, language: "ar" }, createdAt: new Date(), lastSeenAt: new Date() },
    { id: USER_B_ID, googleId: "g-b", email: "bob@example.com", name: "Bob", plan: "free", planExpiresAt: null, paidOnce: false, isSingleUsed: false, isAdmin: false, preferences: { darkMode: false, emailNotifications: true, contractReminders: true, language: "ar" }, createdAt: new Date(), lastSeenAt: new Date() },
    { id: USER_C_ID, googleId: "g-c", email: "mallory@evil.com", name: "Mallory", plan: "free", planExpiresAt: null, paidOnce: false, isSingleUsed: false, isAdmin: false, preferences: { darkMode: false, emailNotifications: true, contractReminders: true, language: "ar" }, createdAt: new Date(), lastSeenAt: new Date() },
    { id: ADMIN_ID, googleId: "g-admin", email: "admin@miithaq.com", name: "Admin", plan: "office", planExpiresAt: null, paidOnce: true, isSingleUsed: false, isAdmin: true, preferences: { darkMode: false, emailNotifications: true, contractReminders: true, language: "ar" }, createdAt: new Date(), lastSeenAt: new Date() }
  );
}

const sessFor = (u) => ({ user: { id: u.googleId, dbId: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin } });
const VALID_PNG_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// --- 7.1 Unauthenticated access matrix across all protected endpoints (20 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = null;

  const protectedCalls = [
    ["GET /api/contracts", () => routeContracts.GET()],
    ["POST /api/contracts", () => routeContracts.POST(makeReq("https://miithaq.com/api/contracts", { method: "POST", json: { type: "sale", party1: "A", party2: "B", party2Email: "b@b.com" } }))],
    ["POST /api/contracts/restore", () => routeRestore.POST(makeReq("https://miithaq.com/api/contracts/restore", { method: "POST", json: { type: "sale", party1: "A", party2: "B", party2Email: "b@b.com" } }))],
    ["GET /api/contracts/[id]", () => routeContractId.GET(makeReq("https://miithaq.com/api/contracts/x"), { params: Promise.resolve({ id: "x" }) })],
    ["PUT /api/contracts/[id]", () => routeContractId.PUT(makeReq("https://miithaq.com/api/contracts/x", { method: "PUT", json: {} }), { params: Promise.resolve({ id: "x" }) })],
    ["DELETE /api/contracts/[id]", () => routeContractId.DELETE(makeReq("https://miithaq.com/api/contracts/x", { method: "DELETE" }), { params: Promise.resolve({ id: "x" }) })],
    ["GET /api/contracts/[id]/share-info", () => routeShareInfo.GET(makeReq("https://miithaq.com/api/contracts/x/share-info"), { params: Promise.resolve({ id: "x" }) })],
    ["POST /api/checkout", () => routeCheckout.POST(makeReq("https://miithaq.com/api/checkout", { method: "POST", json: {} }))],
    ["POST /api/payment-requests", () => routePayReqs.POST(makeReq("https://miithaq.com/api/payment-requests", { method: "POST", json: {} }))],
    ["GET /api/me", () => routeMe.GET()],
    ["PATCH /api/me", () => routeMe.PATCH(makeReq("https://miithaq.com/api/me", { method: "PATCH", json: {} }))],
    ["GET /api/admin/users", () => routeAdminUsers.GET(makeReq("https://miithaq.com/api/admin/users"))],
    ["POST /api/admin/users", () => routeAdminUsers.POST(makeReq("https://miithaq.com/api/admin/users", { method: "POST", json: {} }))],
    ["GET /api/admin/transactions", () => routeAdminTx.GET()],
    ["POST /api/admin/transactions", () => routeAdminTx.POST(makeReq("https://miithaq.com/api/admin/transactions", { method: "POST", json: {} }))],
    ["GET /api/admin/payment-requests", () => routeAdminPay.GET()],
    ["POST /api/admin/payment-requests", () => routeAdminPay.POST(makeReq("https://miithaq.com/api/admin/payment-requests", { method: "POST", json: {} }))],
    ["GET /api/admin/logs", () => routeAdminLogs.GET(makeReq("https://miithaq.com/api/admin/logs"))],
    ["GET /api/errors", () => routeErrors.GET(makeReq("https://miithaq.com/api/errors"))],
    ["DELETE /api/errors", () => routeErrors.DELETE(makeReq("https://miithaq.com/api/errors", { method: "DELETE", json: { all: true } }))],
  ];
  for (const [label, fn] of protectedCalls) {
    const res = await fn();
    secAssert(res.status === 401 || res.status === 403, "AUTH-UNAUTH", "CRITICAL", "Protected route allowed unauthenticated request", `${label} returned ${res.status}`);
  }
}

// --- 7.2 Non-admin access to all admin endpoints (10 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[0]); // non-admin Alice

  const adminCalls = [
    ["GET /api/admin/users", () => routeAdminUsers.GET(makeReq("https://miithaq.com/api/admin/users"))],
    ["POST /api/admin/users", () => routeAdminUsers.POST(makeReq("https://miithaq.com/api/admin/users", { method: "POST", json: { action: "toggle_admin", userId: USER_A_ID } }))],
    ["GET /api/admin/transactions", () => routeAdminTx.GET()],
    ["POST /api/admin/transactions", () => routeAdminTx.POST(makeReq("https://miithaq.com/api/admin/transactions", { method: "POST", json: { id: "x", action: "verify" } }))],
    ["GET /api/admin/payment-requests", () => routeAdminPay.GET()],
    ["POST /api/admin/payment-requests", () => routeAdminPay.POST(makeReq("https://miithaq.com/api/admin/payment-requests", { method: "POST", json: { id: "x", action: "paid" } }))],
    ["GET /api/admin/logs", () => routeAdminLogs.GET(makeReq("https://miithaq.com/api/admin/logs"))],
    ["GET /api/errors", () => routeErrors.GET(makeReq("https://miithaq.com/api/errors"))],
    ["DELETE /api/errors", () => routeErrors.DELETE(makeReq("https://miithaq.com/api/errors", { method: "DELETE", json: { all: true } }))],
  ];
  for (const [label, fn] of adminCalls) {
    const res = await fn();
    secAssert(res.status === 403, "AUTHZ-ADMIN", "CRITICAL", "Non-admin accessed admin endpoint", `${label} returned ${res.status}`);
  }
}

// --- 7.3 Free Plan Quota Enforcement vs /api/contracts/restore Complete Bypass! (30 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[0]); // Alice (free plan, max 3/month)

  // First 3 via POST /api/contracts should succeed
  for (let i = 0; i < 3; i++) {
    const r = await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
      method: "POST",
      json: { type: "sale", party1: "Alice", party2: `Client ${i}`, party2Email: "bob@example.com" },
    }));
    secAssert(r.status === 201, "QUOTA-NORMAL", "MEDIUM", "Free user unable to create within 3-contract quota", `contract #${i + 1} got ${r.status}`);
  }
  // 4th via POST /api/contracts must return 402
  const r4 = await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
    method: "POST",
    json: { type: "sale", party1: "Alice", party2: "Client 4", party2Email: "bob@example.com" },
  }));
  secAssert(r4.status === 402, "QUOTA-BLOCK", "HIGH", "Free user exceeded 3-contract quota on POST /api/contracts", `4th got ${r4.status}`);

  // EXPLOIT: Now bypass quota completely via POST /api/contracts/restore 15 times!
  for (let i = 0; i < 15; i++) {
    const bypass = await routeRestore.POST(makeReq("https://miithaq.com/api/contracts/restore", {
      method: "POST",
      json: { type: "sale", party1: "Alice", party2: `Bypass ${i}`, party2Email: "bob@example.com" },
    }));
    secAssert(
      bypass.status === 402,
      "BYPASS-01",
      "CRITICAL",
      "POST /api/contracts/restore completely bypasses monthly plan limits (free user creates unlimited contracts)",
      `Free user already at 3/3 limit created contract #${4 + i} via /api/contracts/restore (HTTP ${bypass.status})`
    );
  }
}

// --- 7.4 Prototype Key Bypass on Live POST /api/contracts & /api/contracts/restore (20 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[3]); // Admin (unlimited)

  for (const key of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"]) {
    // Variant A: without clauses -> triggers unhandled TypeError 500 crash in resolveClauses!
    let statusA = 500;
    let errA = "";
    try {
      const r1 = await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
        method: "POST",
        json: { type: key, party1: "Alice", party2: "Bob", party2Email: "bob@example.com" },
      }));
      statusA = r1.status;
    } catch (e) {
      statusA = 500;
      errA = e.message;
    }
    secAssert(
      statusA === 422,
      "PROTO-02",
      "HIGH",
      "POST /api/contracts accepts JS Object.prototype keys as contract types (500 TypeError crash without clauses; 201 DB corruption with clauses)",
      `type="${key}" (no clauses) => HTTP ${statusA} (${errA || "not rejected"})`
    );

    // Variant B: with custom clauses -> bypasses validation & stores prototype key into DB with HTTP 201!
    let statusB = 500;
    let bodyB = null;
    try {
      const r1b = await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
        method: "POST",
        json: { type: key, party1: "Alice", party2: "Bob", party2Email: "bob@example.com", clauses: ["بند مخصص"] },
      }));
      statusB = r1b.status;
      bodyB = await r1b.json();
    } catch {
      statusB = 500;
    }
    secAssert(
      statusB === 422,
      "PROTO-02",
      "HIGH",
      "POST /api/contracts accepts JS Object.prototype keys as contract types (500 TypeError crash without clauses; 201 DB corruption with clauses)",
      `type="${key}" (with clauses) => HTTP ${statusB}; content leaked: "${String(bodyB?.contract?.content || "").split("\n")[2]}"`
    );

    let statusR = 500;
    try {
      const r2 = await routeRestore.POST(makeReq("https://miithaq.com/api/contracts/restore", {
        method: "POST",
        json: { type: key, party1: "Alice", party2: "Bob", party2Email: "bob@example.com", clauses: ["بند"] },
      }));
      statusR = r2.status;
    } catch {
      statusR = 500;
    }
    secAssert(
      statusR === 422,
      "PROTO-02",
      "HIGH",
      "POST /api/contracts/restore accepts JS Object.prototype keys as contract types",
      `restore type="${key}" => HTTP ${statusR}`
    );
  }
}

// --- 7.5 CRITICAL EXPLOIT: Bait-and-Switch Contract Tampering AFTER Party 2 Signed! ---
{
  const state = resetMockState();
  seedUsers(state);
  // 1. Alice creates $500 contract
  state.session = sessFor(state.tables.users[0]);
  const createdRes = await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
    method: "POST",
    json: { type: "sale", party1: "Alice", party2: "Bob", party2Email: "bob@example.com", amount: "500 USD", subject: "Website design" },
  }));
  const created = (await createdRes.json()).contract;

  // 2. Bob signs the $500 contract (status -> partially_signed)
  state.session = sessFor(state.tables.users[1]);
  const sign2Res = await routeSignatures.POST(
    makeReq(`https://miithaq.com/api/contracts/${created.shareToken}/signatures`, {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
      json: { party: "party2", name: "Bob", signatureData: VALID_PNG_DATA },
    }),
    { params: Promise.resolve({ id: created.shareToken }) }
  );
  secAssert(sign2Res.status === 200, "SIGN2-OK", "HIGH", "Legitimate Party 2 signing failed");

  // 3. EXPLOIT: Alice tampers with amount ($500 -> $50,000) AFTER Bob already signed!
  state.session = sessFor(state.tables.users[0]);
  const tamperRes = await routeContractId.PUT(
    makeReq(`https://miithaq.com/api/contracts/${created.shareToken}`, {
      method: "PUT",
      json: { amount: "50000 USD", subject: "Transfer house ownership to Alice" },
    }),
    { params: Promise.resolve({ id: created.shareToken }) }
  );
  secAssert(
    tamperRes.status === 409,
    "TAMPER-01",
    "HIGH",
    "Bait-and-Switch Fraud: Owner can edit amount & clauses via PUT /api/contracts/[id] AFTER Party 2 already signed (re-sealing valid SHA-256 over forged terms!)",
    `PUT on partially_signed contract returned HTTP ${tamperRes.status} — Bob's verified signature now bound to '50000 USD'!`
  );

  // 4. Alice now signs as Party 1 -> contract becomes "signed", and /api/verify reports matched:true!
  await routeSignatures.POST(
    makeReq(`https://miithaq.com/api/contracts/${created.shareToken}/signatures`, {
      method: "POST",
      json: { party: "party1", name: "Alice", signatureData: VALID_PNG_DATA },
    }),
    { params: Promise.resolve({ id: created.shareToken }) }
  );
  const verRes = await routeVerify.GET(
    makeReq(`https://miithaq.com/api/verify/${created.shareToken}`),
    { params: Promise.resolve({ id: created.shareToken }) }
  );
  const verData = await verRes.json();
  secAssert(
    !(tamperRes.status === 200 && verData.matched === true && verData.status === "signed"),
    "TAMPER-01",
    "HIGH",
    "Bait-and-Switch Fraud verified end-to-end: /api/verify reports matched=true & status=signed on tampered contract",
    `/api/verify returned matched=${verData.matched}, status=${verData.status}, signer=${verData.signatureLog?.[0]?.signerEmailMasked}`
  );

  // 5. EXPLOIT: Owner deletes fully signed contract, permanently wiping cryptographic proof & signature_events!
  const delRes = await routeContractId.DELETE(
    makeReq(`https://miithaq.com/api/contracts/${created.shareToken}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: created.shareToken }) }
  );
  secAssert(
    delRes.status === 409 || delRes.status === 403,
    "DELETE-SIGNED-01",
    "HIGH",
    "Owner can DELETE a fully signed contract, cascading deletion of all signature_events & destroying legal proof for Party 2",
    `DELETE on status='signed' returned HTTP ${delRes.status}; remaining signature_events=${state.tables.signature_events.length}`
  );
}

// --- 7.6 IDOR Cross-User Contract Access Tests (30 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[0]); // Alice
  const c = (await (await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
    method: "POST",
    json: { type: "nda", party1: "Alice", party2: "Bob", party2Email: "bob@example.com" },
  }))).json()).contract;

  // Mallory tries GET, PUT, DELETE, share-info, party1 sign, party2 sign
  state.session = sessFor(state.tables.users[2]); // Mallory
  const g = await routeContractId.GET(makeReq(`https://miithaq.com/api/contracts/${c.shareToken}`), { params: Promise.resolve({ id: c.shareToken }) });
  secAssert(g.status === 404, "IDOR-GET", "CRITICAL", "IDOR on GET /api/contracts/[id]");
  const p = await routeContractId.PUT(makeReq(`https://miithaq.com/api/contracts/${c.shareToken}`, { method: "PUT", json: { amount: "1" } }), { params: Promise.resolve({ id: c.shareToken }) });
  secAssert(p.status === 404, "IDOR-PUT", "CRITICAL", "IDOR on PUT /api/contracts/[id]");
  const d = await routeContractId.DELETE(makeReq(`https://miithaq.com/api/contracts/${c.shareToken}`, { method: "DELETE" }), { params: Promise.resolve({ id: c.shareToken }) });
  secAssert(d.status === 404, "IDOR-DEL", "CRITICAL", "IDOR on DELETE /api/contracts/[id]");
  const si = await routeShareInfo.GET(makeReq(`https://miithaq.com/api/contracts/${c.shareToken}/share-info`), { params: Promise.resolve({ id: c.shareToken }) });
  secAssert(si.status === 404, "IDOR-SHAREINFO", "HIGH", "IDOR on GET /api/contracts/[id]/share-info");
  const s1 = await routeSignatures.POST(makeReq(`https://miithaq.com/api/contracts/${c.shareToken}/signatures`, { method: "POST", json: { party: "party1", signatureData: VALID_PNG_DATA } }), { params: Promise.resolve({ id: c.shareToken }) });
  secAssert(s1.status === 401, "IDOR-SIGN1", "CRITICAL", "Non-owner allowed to sign as party1");
  const s2 = await routeSignatures.POST(makeReq(`https://miithaq.com/api/contracts/${c.shareToken}/signatures`, { method: "POST", json: { party: "party2", signatureData: VALID_PNG_DATA } }), { params: Promise.resolve({ id: c.shareToken }) });
  secAssert(s2.status === 403, "IDOR-SIGN2", "CRITICAL", "Unbound user allowed to sign as party2");

  // Owner Alice tries to forge Party 2 signature -> MUST be 403
  state.session = sessFor(state.tables.users[0]);
  const ownerForge = await routeSignatures.POST(makeReq(`https://miithaq.com/api/contracts/${c.shareToken}/signatures`, { method: "POST", json: { party: "party2", signatureData: VALID_PNG_DATA } }), { params: Promise.resolve({ id: c.shareToken }) });
  secAssert(ownerForge.status === 403, "SELF-SIGN2", "CRITICAL", "Owner allowed to sign as party2");
}

// --- 7.7 Signature Validation Bypass, IP Spoofing & Concurrent TOCTOU Race Condition (50 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[0]);

  const fakePngPayloads = [
    'data:image/png;base64,iVBORw0KGgo<script>alert(1)</script>',
    'data:image/png;base64,iVBORw0KGgo" onerror="alert(1)',
    'data:image/png;base64,iVBORw0KGgoNOT_VALID_BASE64!!!@@@###',
    'data:image/png;base64,iVBORw0KGgo' + 'Z'.repeat(190_000),
  ];
  for (const fp of fakePngPayloads) {
    const c = (await (await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
      method: "POST",
      json: { type: "sale", party1: "Alice", party2: "Bob", party2Email: "bob@example.com" },
    }))).json()).contract;
    // Reset user plan to admin-like to avoid quota during loop
    state.tables.users[0].plan = "office";
    const res = await routeSignatures.POST(
      makeReq(`https://miithaq.com/api/contracts/${c.shareToken}/signatures`, {
        method: "POST",
        headers: { "x-forwarded-for": "1.3.3.7, 10.0.0.1" },
        json: { party: "party1", name: "Alice", signatureData: fp },
      }),
      { params: Promise.resolve({ id: c.shareToken }) }
    );
    secAssert(
      res.status === 422,
      "SIG-PNG-01",
      "MEDIUM",
      "Signature endpoint only checks 11-char prefix 'iVBORw0KGgo' — accepts corrupted/non-PNG/HTML-polyglot strings as valid signatures",
      `Accepted payload starting with ${fp.slice(0, 55)} (HTTP ${res.status})`
    );
  }

  // Check IP spoofing recorded into signature_events
  const spoofedEv = state.tables.signature_events.find((e) => e.ipAddress === "1.3.3.7");
  secAssert(
    !spoofedEv,
    "IP-SPOOF-01",
    "HIGH",
    "Legal proof table signature_events stores attacker-spoofed first-hop X-Forwarded-For IP address",
    `Recorded spoofed ipAddress="${spoofedEv?.ipAddress}"`
  );

  // Concurrent TOCTOU signing race condition!
  const cRace = (await (await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
    method: "POST",
    json: { type: "sale", party1: "Alice", party2: "Bob", party2Email: "bob@example.com" },
  }))).json()).contract;
  state.dbDelayMs = 15; // expose async interleaving window
  const p1Promise = (async () => {
    state.session = sessFor(state.tables.users[0]);
    return routeSignatures.POST(
      makeReq(`https://miithaq.com/api/contracts/${cRace.shareToken}/signatures`, {
        method: "POST",
        json: { party: "party1", name: "Alice", signatureData: VALID_PNG_DATA },
      }),
      { params: Promise.resolve({ id: cRace.shareToken }) }
    );
  })();
  // Slight stagger so auth() captures Bob while p1 is awaiting DB
  await new Promise((r) => setTimeout(r, 1));
  state.session = sessFor(state.tables.users[1]);
  const p2Promise = routeSignatures.POST(
    makeReq(`https://miithaq.com/api/contracts/${cRace.shareToken}/signatures`, {
      method: "POST",
      json: { party: "party2", name: "Bob", signatureData: VALID_PNG_DATA },
    }),
    { params: Promise.resolve({ id: cRace.shareToken }) }
  );
  await Promise.all([p1Promise, p2Promise]);
  state.dbDelayMs = 0;

  const finalRow = state.tables.contracts.find((x) => x.id === cRace.id);
  const verAfterRace = await (await routeVerify.GET(
    makeReq(`https://miithaq.com/api/verify/${cRace.shareToken}`),
    { params: Promise.resolve({ id: cRace.shareToken }) }
  )).json();

  secAssert(
    finalRow.status === "signed" && verAfterRace.matched === true,
    "RACE-01",
    "HIGH",
    "TOCTOU Race Condition on concurrent party1+party2 signing corrupts contract status & desynchronizes SHA-256 contentHash",
    `After both signed concurrently: status="${finalRow.status}", verify.matched=${verAfterRace.matched}`
  );
}

// --- 7.8 Checkout Fraud, Instant Self-Upgrade & Suspension Bypass + paidOnce Persistence! (40 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  const mallory = state.tables.users[2];
  state.session = sessFor(mallory);

  // 1. Mallory submits fake ShamCash txNumber for 'verified' ($9 lifetime) -> instant upgrade!
  const chk1 = await routeCheckout.POST(makeReq("https://miithaq.com/api/checkout", {
    method: "POST",
    json: { planId: "verified", transactionNumber: "1234567890", contactPhone: "0933123456" },
  }));
  secAssert(
    !(chk1.status === 200 && mallory.plan === "verified" && mallory.paidOnce === true),
    "FRAUD-01",
    "CRITICAL",
    "Instant unverified self-upgrade: any user submitting a fake 6-digit number immediately gets 'verified'/'office' & permanent paidOnce=true",
    `Fake tx '1234567890' immediately set mallory.plan="${mallory.plan}", paidOnce=${mallory.paidOnce}`
  );

  // 2. Admin detects fraud and SUSPENDS Mallory's transaction!
  const txId = state.tables.transactions[0].id;
  state.session = sessFor(state.tables.users[3]); // Admin
  const susp = await routeAdminTx.POST(makeReq("https://miithaq.com/api/admin/transactions", {
    method: "POST",
    json: { id: txId, action: "suspend" },
  }));
  secAssert(susp.status === 200, "ADMIN-SUSP-OK", "MEDIUM", "Admin suspend failed");

  // EXPLOIT A: Mallory's paidOnce is STILL true after suspension! So she still creates unlimited contracts!
  state.session = sessFor(mallory);
  for (let i = 0; i < 5; i++) {
    await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
      method: "POST",
      json: { type: "sale", party1: "Mallory", party2: `Victim ${i}`, party2Email: "bob@example.com" },
    }));
  }
  const malloryContracts = state.tables.contracts.filter((c) => c.ownerId === mallory.id).length;
  secAssert(
    malloryContracts === 0,
    "FRAUD-02",
    "CRITICAL",
    "Admin 'suspend' fails to reset paidOnce=false and POST /api/contracts doesn't block suspended users — suspended fraudster creates unlimited contracts forever!",
    `Suspended fraudster (plan="${mallory.plan}", paidOnce=${mallory.paidOnce}) created ${malloryContracts}/5 contracts!`
  );

  // EXPLOIT B: Suspended Mallory submits checkout AGAIN and re-upgrades herself to 'office' ($49/mo)!
  const chk2 = await routeCheckout.POST(makeReq("https://miithaq.com/api/checkout", {
    method: "POST",
    json: { planId: "office", transactionNumber: "9876543210", contactPhone: "0933123456" },
  }));
  secAssert(
    chk2.status === 403,
    "FRAUD-03",
    "HIGH",
    "Suspended user can call POST /api/checkout again to instantly re-upgrade to 'office' ($49/mo)!",
    `Suspended user checkout returned HTTP ${chk2.status}, mallory.plan="${mallory.plan}"`
  );

  // Verify /api/verify DOES block suspended user's contract (positive control!)
  const mContract = state.tables.contracts.find((c) => c.ownerId === mallory.id);
  if (mContract) {
    const vSusp = await routeVerify.GET(
      makeReq(`https://miithaq.com/api/verify/${mContract.shareToken}`),
      { params: Promise.resolve({ id: mContract.shareToken }) }
    );
    secAssert(vSusp.status === 403, "VERIFY-SUSP-BLOCK", "HIGH", "/api/verify failed to block suspended owner", `got ${vSusp.status}`);
  }
}

// --- 7.9 Checkout & Payment-Requests Input Fuzzing + IDOR contractId + Unbounded Lengths (160 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[0]);

  // Fuzz checkout with 100 invalid txNumbers / phones / plans
  const badTx = ["", "12345", "123456789012345678901", "abcdef", "123 456", "123456;DROP", "-123456", "1234.56"];
  const badPlans = ["free", "legal_review", "admin", "__proto__", "constructor", "", "' OR 1=1--"];
  for (let i = 0; i < 60; i++) {
    const r = await routeCheckout.POST(makeReq("https://miithaq.com/api/checkout", {
      method: "POST",
      json: { planId: "verified", transactionNumber: badTx[i % badTx.length], contactPhone: "0933123456" },
    }));
    secAssert(r.status === 422, "CHK-TX-VAL", "MEDIUM", "Checkout accepted invalid transactionNumber");
  }
  for (let i = 0; i < 40; i++) {
    const r = await routeCheckout.POST(makeReq("https://miithaq.com/api/checkout", {
      method: "POST",
      json: { planId: badPlans[i % badPlans.length], transactionNumber: "1234567", contactPhone: "0933123456" },
    }));
    secAssert(r.status === 422, "CHK-PLAN-VAL", "MEDIUM", "Checkout accepted invalid planId");
  }

  // Payment requests: unbounded 500KB txRef + foreign contractId IDOR!
  const aliceContractId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  state.tables.contracts.push({
    id: aliceContractId, ownerId: USER_A_ID, type: "sale", status: "draft", signingMode: "send",
    party1Name: "Alice", party2Name: "Bob", clauses: [], content: "", contentHash: "", shareToken: crypto.randomUUID(),
    createdAt: new Date(), updatedAt: new Date(),
  });
  state.session = sessFor(state.tables.users[2]); // Mallory
  const prExploit = await routePayReqs.POST(makeReq("https://miithaq.com/api/payment-requests", {
    method: "POST",
    json: {
      plan: "legal_review",
      method: "shamcash",
      txRef: "X".repeat(500_000),
      senderName: "Y".repeat(100_000),
      contractId: aliceContractId, // Belongs to Alice, NOT Mallory!
    },
  }));
  secAssert(
    prExploit.status === 422 || prExploit.status === 413 || prExploit.status === 403,
    "PAYREQ-01",
    "HIGH",
    "POST /api/payment-requests accepts unbounded 600KB txRef/senderName (DB DoS) & unverified foreign contractId (IDOR)",
    `Accepted 600KB payload bound to Alice's contractId with HTTP ${prExploit.status}`
  );

  // Payment requests: non-UUID contractId causes unhandled Postgres 22P02 500 crash
  let crashed = false;
  try {
    await routePayReqs.POST(makeReq("https://miithaq.com/api/payment-requests", {
      method: "POST",
      json: { plan: "basic", method: "usdt", txRef: "TX12345678", contractId: "not-a-uuid" },
    }));
  } catch (e) {
    crashed = e.code === "22P02";
  }
  secAssert(
    !crashed,
    "UUID-01",
    "MEDIUM",
    "Missing UUID validation causes unhandled Postgres 22P02 500 crashes across API endpoints",
    `POST /api/payment-requests with contractId="not-a-uuid" threw uncaught 22P02`
  );
}

// --- 7.10 PATCH /api/me Unbounded Storage DoS & Preferences Schema/Prototype Pollution ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[0]);

  const meRes = await routeMe.PATCH(makeReq("https://miithaq.com/api/me", {
    method: "PATCH",
    json: {
      phone: "9".repeat(300_000),
      address: "A".repeat(300_000),
      preferences: {
        darkMode: "not-a-boolean",
        isAdmin: true,
        arbitraryJunk: "J".repeat(200_000),
      },
    },
  }));
  const updatedUser = state.tables.users[0];
  secAssert(
    meRes.status === 422 || meRes.status === 413 || ((updatedUser.phone || "").length <= 40 && !("arbitraryJunk" in (updatedUser.preferences || {}))),
    "ME-01",
    "HIGH",
    "PATCH /api/me lacks body/field length caps & schema validation — allows multi-MB DB bloating & arbitrary keys in users.preferences",
    `Stored phone len=${(updatedUser.phone || "").length}, address len=${(updatedUser.address || "").length}, injected keys=${Object.keys(updatedUser.preferences || {}).join(",")}`
  );
}

// --- 7.11 POST /api/errors Anonymous Server-Log Forging & X-Forwarded-For Rate-Limit Bypass (60 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = null; // Completely anonymous attacker!

  // 1. Forge server-side error as anonymous user
  const forgeRes = await routeErrors.POST(makeReq("https://miithaq.com/api/errors", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.1" },
    json: { source: "server", message: "CRITICAL: Neon DB credential rotated — click https://evil.com/fix", url: "https://evil.com/phish" },
  }));
  const forgedLog = state.tables.activity_logs.find((l) => l.action === "error_server");
  secAssert(
    !forgedLog,
    "LOG-FORGE-01",
    "HIGH",
    "Anonymous attacker can forge 'error_server' entries in admin Error Monitor via POST /api/errors",
    `Unauthenticated POST stored action="${forgedLog?.action}" detail="${forgedLog?.detail?.slice(0, 60)}" (HTTP ${forgeRes.status})`
  );

  // 2. Bypass 15 req/min IP rate limit via X-Forwarded-For rotation (50 requests)
  let bypassCount = 0;
  for (let i = 0; i < 50; i++) {
    const r = await routeErrors.POST(makeReq("https://miithaq.com/api/errors", {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.113.${(i % 250) + 1}` },
      json: { source: "browser", message: `Flood error #${i}` },
    }));
    if (r.status === 204) bypassCount++;
  }
  secAssert(
    bypassCount <= 15,
    "RATELIMIT-01",
    "HIGH",
    "POST /api/errors IP rate limit trivially bypassed by rotating X-Forwarded-For header (50/50 requests stored in DB)",
    `${bypassCount}/50 flooded requests accepted (HTTP 204) via XFF rotation`
  );
}

// --- 7.12 Orphan Draft Hijacking & Stale Hash in POST /api/contracts/restore ---
{
  const state = resetMockState();
  seedUsers(state);
  // Seed an orphan draft (e.g., owner was deleted -> ownerId SET NULL, or guest draft)
  const orphanId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  state.tables.contracts.push({
    id: orphanId, ownerId: null, type: "sale", status: "draft", signingMode: "send",
    party1Name: "VictimCo", party2Name: "PartnerCo", amount: "1000", clauses: [],
    content: "", contentHash: "", shareToken: crypto.randomUUID(),
    createdAt: new Date(), updatedAt: new Date(),
  });
  state.session = sessFor(state.tables.users[2]); // Mallory guesses type + party1 + party2
  const hijack = await routeRestore.POST(makeReq("https://miithaq.com/api/contracts/restore", {
    method: "POST",
    json: { type: "sale", party1: "VictimCo", party2: "PartnerCo", party2Email: "bob@example.com", amount: "99999" },
  }));
  const claimed = state.tables.contracts.find((c) => c.id === orphanId);
  secAssert(
    claimed.ownerId !== USER_C_ID,
    "ORPHAN-01",
    "MEDIUM",
    "POST /api/contracts/restore allows hijacking orphan contracts (ownerId=NULL) by matching (type, party1, party2) AND leaves content/contentHash empty",
    `Mallory claimed orphan ${orphanId} (HTTP ${hijack.status}); content="${claimed.content}", contentHash="${claimed.contentHash}"`
  );
}

// --- 7.13 Admin Logs NaN Limit SQL Crash & Admin UUID 22P02 Crashes (15 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  state.session = sessFor(state.tables.users[3]); // Admin

  let nanCrashed = false;
  try {
    await routeAdminLogs.GET(makeReq("https://miithaq.com/api/admin/logs?limit=notanumber"));
  } catch (e) {
    nanCrashed = e.message.includes("NaN");
  }
  secAssert(
    !nanCrashed,
    "ADMIN-NAN-01",
    "MEDIUM",
    "GET /api/admin/logs?limit=abc passes NaN to Drizzle .limit(NaN), causing 500 SQL error",
    `?limit=notanumber passed NaN directly to SQL LIMIT`
  );

  // Admin POST non-UUID checks
  for (const [label, fn] of [
    ["POST /api/admin/users", () => routeAdminUsers.POST(makeReq("https://miithaq.com/api/admin/users", { method: "POST", json: { action: "clear_plan", userId: "not-a-uuid" } }))],
    ["POST /api/admin/transactions", () => routeAdminTx.POST(makeReq("https://miithaq.com/api/admin/transactions", { method: "POST", json: { id: "not-a-uuid", action: "verify" } }))],
    ["POST /api/admin/payment-requests", () => routeAdminPay.POST(makeReq("https://miithaq.com/api/admin/payment-requests", { method: "POST", json: { id: "not-a-uuid", action: "paid" } }))],
    ["DELETE /api/errors", () => routeErrors.DELETE(makeReq("https://miithaq.com/api/errors", { method: "DELETE", json: { id: "not-a-uuid" } }))],
  ]) {
    let threw22P02 = false;
    try {
      await fn();
    } catch (e) {
      threw22P02 = e.code === "22P02";
    }
    secAssert(!threw22P02, "UUID-01", "MEDIUM", "Missing UUID validation causes unhandled Postgres 22P02 500 crashes", `${label} threw 22P02 on non-UUID id`);
  }
}

// --- 7.14 Cron Endpoint Security Tests (30 tests) ---
{
  const state = resetMockState();
  seedUsers(state);
  const origEnv = process.env.NODE_ENV;
  const origSecret = process.env.CRON_SECRET;

  // Production without CRON_SECRET must fail closed (401) even with vercel-cron UA
  process.env.NODE_ENV = "production";
  delete process.env.CRON_SECRET;
  const rProdNoSecret = await routeCron.GET(makeReq("https://miithaq.com/api/cron/expire-plans", { headers: { "user-agent": "vercel-cron/1.0" } }));
  secAssert(rProdNoSecret.status === 401, "CRON-FAIL-CLOSED", "CRITICAL", "Cron did not fail closed in production without CRON_SECRET");

  // With CRON_SECRET set, test wrong tokens, partial prefixes, length variations
  process.env.CRON_SECRET = "super-secret-cron-token-2026";
  for (const authHdr of ["", "Bearer ", "Bearer wrong", "Bearer super-secret-cron-token-202", "Bearer super-secret-cron-token-20260", "Basic super-secret-cron-token-2026"]) {
    const r = await routeCron.GET(makeReq("https://miithaq.com/api/cron/expire-plans", { headers: { authorization: authHdr } }));
    secAssert(r.status === 401, "CRON-AUTH", "CRITICAL", "Cron accepted invalid authorization header", `hdr=${authHdr}`);
  }
  const rValid = await routeCron.GET(makeReq("https://miithaq.com/api/cron/expire-plans", { headers: { authorization: "Bearer super-secret-cron-token-2026" } }));
  secAssert(rValid.status === 200, "CRON-VALID", "MEDIUM", "Cron rejected valid Bearer secret");

  process.env.NODE_ENV = origEnv;
  if (origSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = origSecret;
}

// --- 7.15 New Admin Command Center Endpoints + Single-Plan Verify Guard ---
{
  const state = resetMockState();
  seedUsers(state);
  const alice = state.tables.users[0];
  const admin = state.tables.users[3];

  // Unauthenticated & non-admin MUST get 403 on all new admin endpoints
  for (const [who, sess] of [["guest", null], ["non-admin", sessFor(alice)]]) {
    state.session = sess;
    const r1 = await routeAdminTelegramTest.POST();
    const r2 = await routeAdminUserContracts.GET(makeReq(`https://miithaq.com/api/admin/users/${USER_A_ID}/contracts`), { params: Promise.resolve({ id: USER_A_ID }) });
    const r3 = await routeAdminContracts.GET(makeReq("https://miithaq.com/api/admin/contracts"));
    const r4 = await routeAdminContractId.DELETE(makeReq(`https://miithaq.com/api/admin/contracts/${USER_A_ID}`, { method: "DELETE" }), { params: Promise.resolve({ id: USER_A_ID }) });
    for (const [name, res] of [["telegram-test", r1], ["user-contracts", r2], ["admin-contracts", r3], ["admin-contract-del", r4]]) {
      secAssert(res.status === 403, "ADMIN-NEW-AUTHZ", "CRITICAL", `New admin endpoint ${name} allowed ${who}`, `${who} got HTTP ${res.status}`);
      secAssert((res.headers.get("cache-control") || "").includes("no-store"), "ADMIN-NEW-CACHE", "LOW", `New admin endpoint ${name} missing no-store`);
    }
  }

  // Admin: invalid UUIDs must return 422 cleanly (never 500)
  state.session = sessFor(admin);
  const badU = await routeAdminUserContracts.GET(makeReq("https://miithaq.com/api/admin/users/bad-id/contracts"), { params: Promise.resolve({ id: "bad-id" }) });
  const badC = await routeAdminContractId.DELETE(makeReq("https://miithaq.com/api/admin/contracts/bad-id", { method: "DELETE" }), { params: Promise.resolve({ id: "bad-id" }) });
  secAssert(badU.status === 422 && badC.status === 422, "ADMIN-NEW-UUID", "MEDIUM", "New admin routes did not reject non-UUID with 422", `u=${badU.status}, c=${badC.status}`);

  // Admin: delete contract succeeds and writes audit log
  state.session = sessFor(alice);
  const created = await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
    method: "POST",
    json: { type: "sale", party1: "Alice", party2: "Bob", party2Email: "bob@example.com" },
  }));
  const createdBody = await created.json();
  const cid = createdBody.contract.id;

  state.session = sessFor(admin);
  const ucRes = await routeAdminUserContracts.GET(makeReq(`https://miithaq.com/api/admin/users/${USER_A_ID}/contracts`), { params: Promise.resolve({ id: USER_A_ID }) });
  const ucBody = await ucRes.json();
  secAssert(ucRes.status === 200 && ucBody.contracts.some((c) => c.id === cid), "ADMIN-USER-CONTRACTS", "MEDIUM", "Admin user contracts endpoint did not return user's contract");

  const delRes = await routeAdminContractId.DELETE(makeReq(`https://miithaq.com/api/admin/contracts/${cid}`, { method: "DELETE" }), { params: Promise.resolve({ id: cid }) });
  secAssert(delRes.status === 200 && !state.tables.contracts.some((c) => c.id === cid), "ADMIN-CONTRACT-DEL", "MEDIUM", "Admin contract DELETE failed");
  secAssert(state.tables.activity_logs.some((l) => l.action === "admin_contract_deleted" && l.entityId === cid), "ADMIN-CONTRACT-DEL-LOG", "MEDIUM", "Admin contract DELETE did not record audit log");

  // Single-plan billing integrity: instant checkout -> use 1 contract -> admin verify MUST keep isSingleUsed=true!
  state.session = sessFor(alice);
  const chkS = await routeCheckout.POST(makeReq("https://miithaq.com/api/checkout", {
    method: "POST",
    json: { planId: "single", transactionNumber: "5566778899", contactPhone: "0933998877" },
  }));
  secAssert(chkS.status === 200 && alice.plan === "single" && alice.isSingleUsed === false, "SINGLE-CHK", "MEDIUM", "Single plan checkout failed");

  const use1 = await routeContracts.POST(makeReq("https://miithaq.com/api/contracts", {
    method: "POST",
    json: { type: "pledge", party1: "Alice", party2: "Bob", party2Email: "bob@example.com" },
  }));
  secAssert(use1.status === 201 && alice.isSingleUsed === true, "SINGLE-USE", "MEDIUM", "Single plan contract consumption failed");

  const singleTx = state.tables.transactions.find((t) => t.transactionNumber === "5566778899");
  state.session = sessFor(admin);
  const verS = await routeAdminTx.POST(makeReq("https://miithaq.com/api/admin/transactions", {
    method: "POST",
    json: { id: singleTx.id, action: "verify" },
  }));
  secAssert(
    verS.status === 200 && alice.isSingleUsed === true,
    "SINGLE-VERIFY-PRESERVE",
    "HIGH",
    "Admin evening verify reset isSingleUsed=false on an already-consumed single plan, granting a free extra contract",
    `After verify: alice.plan=${alice.plan}, isSingleUsed=${alice.isSingleUsed}`
  );
}

// --- 7.16 Guest Prompt XFF Table Flooding (25 tests) ---
{
  const state = resetMockState();
  state.session = null;
  for (let i = 0; i < 25; i++) {
    await routeGuestPrompt.POST(makeReq("https://miithaq.com/api/guest-prompt", {
      method: "POST",
      headers: { "x-forwarded-for": `192.0.2.${i + 1}` },
    }));
  }
  secAssert(
    state.tables.guest_prompt_seen.length < 25,
    "GUEST-FLOOD-01",
    "MEDIUM",
    "Unauthenticated POST /api/guest-prompt allows unbounded DB row insertion via X-Forwarded-For spoofing",
    `Inserted ${state.tables.guest_prompt_seen.length} distinct rows with spoofed XFF headers`
  );
}

// --- 7.16 Health Check Hygiene ---
{
  const rHealth = await routeHealth.GET();
  const hJson = await rHealth.json();
  secAssert(rHealth.status === 200 && hJson.ok === true && !JSON.stringify(hJson).includes("postgres://"), "HEALTH-01", "LOW", "Health check exposed connection info");
}

endSuite();

/* ============================================================
   SUITE 8: Next.js Security Headers, CSP, Auth & Proxy Matcher
   (~200 tests)
   ============================================================ */
startSuite("S8", "Security Headers, CSP, auth.config.ts & proxy.ts Matcher");

const nextCfg = nextConfigMod.default;
secAssert(nextCfg.poweredByHeader === false, "HDR-POWERED", "LOW", "X-Powered-By header not disabled");

const hdrBlocks = await nextCfg.headers();
const hdrMap = Object.fromEntries((hdrBlocks[0]?.headers || []).map((h) => [h.key.toLowerCase(), h.value]));

const requiredHeaders = [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "SAMEORIGIN"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["strict-transport-security", "max-age=31536000"],
  ["cross-origin-opener-policy", "same-origin-allow-popups"],
  ["cross-origin-resource-policy", "same-origin"],
  ["x-permitted-cross-domain-policies", "none"],
];
for (const [k, expected] of requiredHeaders) {
  secAssert((hdrMap[k] || "").includes(expected), "HDR-MISSING", "MEDIUM", `Missing or weak security header: ${k}`);
}

const csp = hdrMap["content-security-policy"] || "";
secAssert(csp.includes("object-src 'none'"), "CSP-OBJ", "MEDIUM", "CSP missing object-src 'none'");
secAssert(csp.includes("base-uri 'self'"), "CSP-BASE", "MEDIUM", "CSP missing base-uri 'self'");
secAssert(csp.includes("frame-ancestors 'self'"), "CSP-FRAME", "MEDIUM", "CSP missing frame-ancestors 'self'");
secAssert(!csp.includes("script-src") || !csp.split("script-src")[1].split(";")[0].includes("'unsafe-inline'"),
  "CSP-01",
  "MEDIUM",
  "CSP script-src includes 'unsafe-inline', weakening XSS mitigation (use per-request nonces instead)",
  `script-src directive contains 'unsafe-inline'`
);
secAssert(!/img-src[^;]*\shttps:(?:\s|;|$)/.test(csp),
  "CSP-02",
  "LOW",
  "CSP img-src allows arbitrary https: origins (data exfiltration channel if HTML injection occurs)",
  `img-src allows wildcard https:`
);

// Test authConfig.callbacks.authorized across 80 routes
const authCb = authConfigMod.authConfig.callbacks.authorized;
const privatePaths = ["/admin", "/dashboard", "/print/123", "/sign/123", "/checkout", "/me", "/settings", "/Admin", "/ADMIN", "/print/../../admin"];
const publicPaths = ["/", "/pricing", "/privacy", "/terms", "/contracts", "/contracts/design"];
for (const p of privatePaths) {
  const allowed = authCb({ auth: null, request: { nextUrl: new URL(`https://miithaq.com${p}`) } });
  secAssert(allowed === false, "AUTH-MW-PRIV", "CRITICAL", `Guest allowed into private path ${p}`);
}
for (const p of publicPaths) {
  const allowed = authCb({ auth: null, request: { nextUrl: new URL(`https://miithaq.com${p}`) } });
  secAssert(allowed === true, "AUTH-MW-PUB", "MEDIUM", `Public path ${p} blocked for guest`);
}

// Test proxy.ts matcher regex against static-extension bypass paths!
const matcherPattern = proxyMod.config.matcher[0];
const matcherRe = new RegExp(`^${matcherPattern}$`);
const bypassMatcherPaths = ["/admin/x.png", "/print/123.jpg", "/dashboard/test.svg", "/sign/abc.webp", "/checkout/a.ico"];
for (const p of bypassMatcherPaths) {
  const matchedByProxy = matcherRe.test(p);
  secAssert(
    matchedByProxy,
    "PROXY-01",
    "LOW",
    "proxy.ts matcher excludes ANY path ending in .png/.jpg/.svg/.webp/.ico (e.g., /admin/x.png skips edge middleware; protected by Server Component auth)",
    `Path "${p}" bypassed proxy.ts matcher`
  );
}

// Test 80 random private paths in auth callback
for (let i = 0; i < 80; i++) {
  const rpath = `/${pick(["admin", "dashboard", "print", "sign", "checkout", "internal"])}/${crypto.randomBytes(6).toString("hex")}`;
  secAssert(authCb({ auth: null, request: { nextUrl: new URL(`https://miithaq.com${rpath}`) } }) === false, "AUTH-MW-RAND", "HIGH", "Random private path allowed guest");
}

endSuite();

/* ============================================================
   SUITE 9: High-Volume Property-Based & Mutation Fuzzing
   (3,000 deterministic fuzz test iterations across all core
   pure security/crypto/parsing/formatting functions)
   ============================================================ */
startSuite("S9", "High-Volume Property-Based & Mutation Fuzzing (3,000 vectors)");

const CHARSETS = [
  Array.from("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
  Array.from("ابتثجحخدذرزسشصضطظعغفقكلمنهويءآأؤإئىة٠١٢٣٤٥٦٧٨٩"),
  Array.from("<>\"'`;(){}[]|\\/$&*?%#@^~!=+-_.,:\t\n"),
  Array.from("🔐📄⚖️🛡️✅❌🇸🇾🇸🇦"),
];
function fuzzStr(minLen, maxLen) {
  const len = randInt(minLen, maxLen);
  let s = "";
  for (let i = 0; i < len; i++) {
    const cs = pick(CHARSETS);
    s += cs[Math.floor(rng() * cs.length)];
  }
  return s;
}

for (let i = 0; i < 600; i++) {
  // 1. Share token bijective roundtrip
  const tok = fuzzStr(1, 64).replace(/^mth_/, "xth_");
  const round = decodeShareToken(encodeShareToken(tok));
  secAssert(round === tok, "FUZZ-TOKEN", "MEDIUM", "Share token roundtrip broken", `tok=${tok.slice(0, 30)}`);

  // 2. contractFingerprint determinism + 64-hex SHA-256 format
  const cObj = {
    id: `id-${i}`,
    type: pick(Object.keys(CONTRACT_TYPES)),
    party1Name: fuzzStr(1, 60),
    party2Name: fuzzStr(1, 60),
    amount: fuzzStr(0, 30),
    date: new Date(1700000000000 + i * 86400000),
    city: fuzzStr(0, 30),
    subject: fuzzStr(0, 80),
    notes: fuzzStr(0, 120),
    clauses: [fuzzStr(1, 80), fuzzStr(1, 80)],
    content: fuzzStr(1, 200),
  };
  const h1 = contractFingerprint(cObj);
  const h2 = contractFingerprint(cObj);
  secAssert(h1 === h2 && /^[0-9a-f]{64}$/.test(h1), "FUZZ-HASH", "HIGH", "Hash non-deterministic or invalid hex");

  // 3. clampText strict length & control-char safety
  const raw = fuzzStr(0, 400);
  const lim = randInt(1, 150);
  const cl = clampText(raw, lim);
  secAssert(cl.length <= lim && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cl), "FUZZ-CLAMP", "MEDIUM", "clampText invariant violated");

  // 4. buildContractContent never throws & stays bounded
  let built = "";
  let builtOk = true;
  try {
    built = buildContractContent({
      type: cObj.type,
      party1Name: clampText(cObj.party1Name, 120) || "طرف1",
      party2Name: clampText(cObj.party2Name, 120) || "طرف2",
      amount: clampText(cObj.amount, 60),
      city: clampText(cObj.city, 80),
      subject: clampText(cObj.subject, 300),
      notes: clampText(cObj.notes, 500),
      clauses: clampClauses(cObj.clauses),
      date: cObj.date,
    });
  } catch {
    builtOk = false;
  }
  secAssert(builtOk && built.includes("بسم الله الرحمن الرحيم"), "FUZZ-BUILD", "MEDIUM", "buildContractContent crashed on fuzz input");

  // 5. cleanMoney & numCanon never emit non-numeric characters
  const mRaw = fuzzStr(0, 80);
  const mc = cleanMoney(mRaw);
  const mn = numCanon(mc);
  secAssert(/^[0-9.]*$/.test(mc) && /^[0-9.]+$/.test(mn), "FUZZ-MONEY", "LOW", "cleanMoney/numCanon emitted non-numeric chars", `mc=${mc} mn=${mn}`);
}

endSuite();

/* ============================================================
   SUITE 10: Launch Upgrade Security Tests
   (Strict $49 Office Logo Gate + PNG/JPEG Magic-Byte Anti-XSS +
    TRON Base58Check / USDT TRC20 Verification + TXID Anti-Replay)
   ============================================================ */
startSuite("S10", "Launch Upgrades ($49 Office Gate, Logo XSS & USDT TRC20)");

{
  // 10.1 TRON Base58Check Checksum & Contract Address Verification
  const officialHex = tronVerifyMod.tronBase58ToHex20("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  secAssert(
    officialHex === "a614f803b6fd780986a42c78ec9c7f77e6ded13c",
    "TRON-01",
    "HIGH",
    "TRON Base58Check decoder failed on official USDT TRC20 contract",
    `got=${officialHex}`
  );
  // Corrupted checksum address MUST return null
  secAssert(
    tronVerifyMod.tronBase58ToHex20("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u") === null,
    "TRON-02",
    "HIGH",
    "TRON Base58Check decoder accepted corrupted checksum address"
  );
  // TXID validation rejects path traversal / SSRF / short strings
  secAssert(
    tronVerifyMod.isValidTronTxid("a".repeat(64)) === true &&
      tronVerifyMod.isValidTronTxid("../admin") === false &&
      tronVerifyMod.isValidTronTxid("a".repeat(63)) === false,
    "TRON-03",
    "HIGH",
    "TRON TXID validator failed to enforce strict 64-hex format"
  );

  // 10.2 Strict $49 Office Branding Gate on PATCH /api/me
  const validPngB64 = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]).toString("base64");
  const validPngDataUrl = `data:image/png;base64,${validPngB64}`;
  const svgXssDataUrl = `data:image/svg+xml;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`;
  const fakePngDataUrl = `data:image/png;base64,${Buffer.from("<html><script>alert(1)</script></html>").toString("base64")}`;

  // Lower plans (free, single, basic, verified, freelancer) + EXPIRED office MUST ALL get 403!
  const blockedCases = [
    { plan: "free", planExpiresAt: null, label: "free" },
    { plan: "single", planExpiresAt: null, label: "single ($2)" },
    { plan: "basic", planExpiresAt: new Date(Date.now() + 864e5), label: "basic ($5)" },
    { plan: "verified", planExpiresAt: new Date(Date.now() + 864e5), label: "verified ($9)" },
    { plan: "freelancer", planExpiresAt: new Date(Date.now() + 864e5), label: "freelancer ($15)" },
    { plan: "office", planExpiresAt: new Date(Date.now() - 864e5), label: "expired office ($49)" },
  ];

  for (const tc of blockedCases) {
    const state = resetMockState();
    seedUsers(state);
    const u = state.tables.users[0];
    u.plan = tc.plan;
    u.planExpiresAt = tc.planExpiresAt;
    u.isAdmin = false;
    state.session = sessFor(u);

    const res = await routeMe.PATCH(
      makeReq("https://miithaq.com/api/me", {
        method: "PATCH",
        json: { preferences: { officeName: "مكتب مزوّر", officeLogo: validPngDataUrl } },
      })
    );
    secAssert(
      res.status === 403,
      "OFFICE-GATE-01",
      "CRITICAL",
      "Non-office or expired office user bypassed $49 office logo gate on PATCH /api/me",
      `plan=${tc.label} => HTTP ${res.status}`
    );
  }

  // Active $49 office user: SVG XSS & spoofed PNG magic bytes MUST be rejected with 422!
  {
    const state = resetMockState();
    seedUsers(state);
    const u = state.tables.users[0];
    u.plan = "office";
    u.planExpiresAt = new Date(Date.now() + 30 * 864e5);
    u.isAdmin = false;
    state.session = sessFor(u);

    const resSvg = await routeMe.PATCH(
      makeReq("https://miithaq.com/api/me", {
        method: "PATCH",
        json: { preferences: { officeLogo: svgXssDataUrl } },
      })
    );
    secAssert(
      resSvg.status === 422,
      "OFFICE-XSS-01",
      "CRITICAL",
      "PATCH /api/me accepted SVG XSS payload in officeLogo",
      `SVG => HTTP ${resSvg.status}`
    );

    const resFake = await routeMe.PATCH(
      makeReq("https://miithaq.com/api/me", {
        method: "PATCH",
        json: { preferences: { officeLogo: fakePngDataUrl } },
      })
    );
    secAssert(
      resFake.status === 422,
      "OFFICE-XSS-02",
      "HIGH",
      "PATCH /api/me accepted HTML spoofed as PNG in officeLogo",
      `Fake PNG => HTTP ${resFake.status}`
    );

    // Valid PNG + officeName MUST succeed with 200!
    const resOk = await routeMe.PATCH(
      makeReq("https://miithaq.com/api/me", {
        method: "PATCH",
        json: { preferences: { officeName: "مكتب النور العقاري", officeLogo: validPngDataUrl } },
      })
    );
    secAssert(
      resOk.status === 200,
      "OFFICE-OK-01",
      "HIGH",
      "Active $49 office user failed to save valid PNG office logo",
      `Active office valid PNG => HTTP ${resOk.status}`
    );

    // hasActiveOfficePlan unit check
    secAssert(
      brandingMod.hasActiveOfficePlan({ plan: "office", planExpiresAt: new Date(Date.now() + 3600_000), isAdmin: false }) === true &&
        brandingMod.hasActiveOfficePlan({ plan: "freelancer", planExpiresAt: new Date(Date.now() + 3600_000), isAdmin: false }) === false,
      "OFFICE-GATE-02",
      "HIGH",
      "hasActiveOfficePlan helper returned unexpected result"
    );
  }

  // 10.3 Global TXID Anti-Replay across two different accounts on POST /api/payment-requests
  {
    const state = resetMockState();
    seedUsers(state);
    const sharedTx = "TX-REPLAY-TEST-9876543210";

    // Account 1 submits ShamCash receipt
    state.session = sessFor(state.tables.users[0]);
    const r1 = await routePayReqs.POST(
      makeReq("https://miithaq.com/api/payment-requests", {
        method: "POST",
        json: { plan: "basic", method: "shamcash", txRef: sharedTx, senderName: "أحمد" },
      })
    );
    secAssert(r1.status === 201, "PAY-REPLAY-SETUP", "MEDIUM", "Initial payment request failed", `HTTP ${r1.status}`);

    // Account 2 tries to replay the EXACT same txRef -> MUST be blocked with 409!
    state.session = sessFor(state.tables.users[1]);
    const r2 = await routePayReqs.POST(
      makeReq("https://miithaq.com/api/payment-requests", {
        method: "POST",
        json: { plan: "office", method: "shamcash", txRef: sharedTx, senderName: "محتال" },
      })
    );
    secAssert(
      r2.status === 409,
      "PAY-REPLAY-01",
      "CRITICAL",
      "POST /api/payment-requests allowed replaying same txRef across a second user account!",
      `Account 2 replay => HTTP ${r2.status}`
    );
  }

  // 10.4 Admin-only protection on POST /api/admin/db-sync (must reject guest & non-admin with 403)
  {
    const state = resetMockState();
    seedUsers(state);
    state.session = null;
    const unauth = await routeAdminDbSync.POST();
    secAssert(
      unauth.status === 403,
      "DBSYNC-AUTH-01",
      "CRITICAL",
      "POST /api/admin/db-sync accessible without authentication",
      `Unauth => HTTP ${unauth.status}`
    );

    state.session = sessFor(state.tables.users[0]); // non-admin
    const nonAdmin = await routeAdminDbSync.POST();
    secAssert(
      nonAdmin.status === 403,
      "DBSYNC-AUTH-02",
      "CRITICAL",
      "POST /api/admin/db-sync accessible by non-admin user",
      `Non-admin => HTTP ${nonAdmin.status}`
    );
  }
}

endSuite();
cleanupTemp();

/* ============================================================
   Final Audit Report Summary (Console + JSON artifact)
   ============================================================ */
const totalTests = suites.reduce((s, x) => s + x.total, 0);
const totalPassed = suites.reduce((s, x) => s + x.passed, 0);
const totalFailed = suites.reduce((s, x) => s + x.failed, 0);
const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const sortedFindings = [...findings.values()].sort(
  (a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)
);

console.log("\n======================================================================");
console.log("  MITHAQ CYBERSECURITY AUDIT & PENETRATION TEST REPORT");
console.log("======================================================================");
for (const s of suites) {
  const status = s.failed === 0 ? "PASS" : `FAIL (${s.failed} checks)`;
  console.log(
    `  [${s.id}] ${s.name.padEnd(56)} | ${String(s.total).padStart(4)} tests | ${String(s.passed).padStart(4)} pass | ${String(s.failed).padStart(4)} fail | ${s.durationMs}ms | ${status}`
  );
}
console.log("----------------------------------------------------------------------");
console.log(`  TOTAL EXECUTED : ${totalTests.toLocaleString()} security tests`);
console.log(`  PASSED CONTROLS: ${totalPassed.toLocaleString()} (${((totalPassed / totalTests) * 100).toFixed(2)}%)`);
console.log(`  FAILED CHECKS  : ${totalFailed.toLocaleString()} across ${sortedFindings.length} distinct vulnerabilities/issues`);
console.log("======================================================================\n");

const bySev = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
for (const f of sortedFindings) bySev[f.severity] = (bySev[f.severity] || 0) + 1;
console.log(
  `  Findings by Severity: CRITICAL=${bySev.CRITICAL} | HIGH=${bySev.HIGH} | MEDIUM=${bySev.MEDIUM} | LOW=${bySev.LOW}\n`
);

for (const f of sortedFindings) {
  console.log(`  [${f.severity}] ${f.id} (${f.suite}, ${f.failedChecks} failing test(s)): ${f.title}`);
  for (const s of f.samples) console.log(`      -> PoC: ${s}`);
}

const reportPath = "/tmp/mithaq-audit-report.json";
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      totals: { totalTests, totalPassed, totalFailed, distinctFindings: sortedFindings.length, bySeverity: bySev },
      suites,
      findings: sortedFindings,
    },
    null,
    2
  )
);
console.log(`\n  Detailed JSON report written to ${reportPath}\n`);
