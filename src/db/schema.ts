import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ============================================================
   ميثاق — مخطط قاعدة البيانات (Neon Postgres + Drizzle ORM)
   ============================================================ */

/* ===== المستخدمون (حسابات ميثاق عبر Google) ===== */
export const users = pgTable(
  "users",
  {
    /* sub من Google — معرّف ثابت لا يتغير */
    id: uuid("id").primaryKey().defaultRandom(),
    googleId: text("google_id").notNull().unique(),
    email: text("email").notNull().unique(),
    name: text("name").notNull().default("مستخدم ميثاق"),
    picture: text("picture").default(""),
    phone: text("phone").default(""),
    address: text("address").default(""),
    plan: text("plan").notNull().default("free"),
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    preferences: jsonb("preferences")
      .$type<{
        darkMode: boolean;
        emailNotifications: boolean;
        contractReminders: boolean;
        language: string;
      }>()
      .notNull()
      .default({
        darkMode: false,
        emailNotifications: true,
        contractReminders: true,
        language: "ar",
      }),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("users_email_idx").on(t.email)]
);

/* ===== العقود — قلب المنصة =====
   status: draft | partially_signed | signed
   signingMode: send (الطرف الثاني يوقع عبر الرابط) | quick (نفس الجهاز) */
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    status: text("status").notNull().default("draft"),
    signingMode: text("signing_mode").notNull().default("send"),

    /* بيانات الأطراف والتفاصيل */
    party1Name: text("party1_name").notNull(),
    party2Name: text("party2_name").notNull(),
    amount: text("amount").default(""),
    city: text("city").default(""),
    country: text("country").default(""),
    subject: text("subject").default(""),
    duration: text("duration").default(""),
    paymentMethod: text("payment_method").default(""),
    notes: text("notes").default(""),
    clauses: jsonb("clauses").$type<string[]>().notNull().default([]),

    /* نص العقد المولّد + بصمة SHA-256 للتحقق من سلامة المحتوى */
    content: text("content").notNull().default(""),
    contentHash: text("content_hash").notNull().default(""),

    /* توقيع الطرف الأول */
    sig1DataUrl: text("sig1_data_url"),
    sig1Name: text("sig1_name"),
    sig1SignedAt: timestamp("sig1_signed_at", { withTimezone: true }),

    /* توقيع الطرف الثاني */
    sig2DataUrl: text("sig2_data_url"),
    sig2Name: text("sig2_name"),
    sig2SignedAt: timestamp("sig2_signed_at", { withTimezone: true }),

    /* الرابط العام + QR مخزّن كـ Data URL */
    shareToken: text("share_token").notNull().unique(),
    qrDataUrl: text("qr_data_url"),

    favorite: boolean("favorite").notNull().default(false),
    premium: boolean("premium").notNull().default(false),
    reviewStatus: text("review_status").notNull().default("none"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("contracts_owner_idx").on(t.ownerId),
    index("contracts_status_idx").on(t.status),
    index("contracts_created_idx").on(t.createdAt),
  ]
);

/* ===== سجل أحداث التوقيع — أغراض الإثبات (IP + جهاز + وقت) ===== */
export const signatureEvents = pgTable(
  "signature_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    party: text("party").notNull(), // party1 | party2
    signerName: text("signer_name").notNull(),
    ipAddress: text("ip_address").default("unknown"),
    userAgent: text("user_agent").default("unknown"),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sig_events_contract_idx").on(t.contractId)]
);

/* ===== طلبات الدفع (شام كاش / USDT / Cryptomus) ===== */
export const paymentRequests = pgTable("payment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  contractId: uuid("contract_id").references(() => contracts.id, {
    onDelete: "set null",
  }),
  plan: text("plan").notNull(),
  amountUsd: text("amount_usd").notNull().default("0"),
  method: text("method").notNull().default("usdt"), // usdt | shamcash | cryptomus
  status: text("status").notNull().default("pending"), // pending | manual_review | paid | rejected
  txRef: text("tx_ref").default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ===== أنواع مستنتجة للاستخدام في الكود ===== */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type SignatureEvent = typeof signatureEvents.$inferSelect;
export type PaymentRequest = typeof paymentRequests.$inferSelect;
