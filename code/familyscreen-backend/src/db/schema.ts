import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  bytea,
  index,
  unique,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// The only import from lib into the schema, and it points one way on purpose:
// these constants back both the CHECK constraints below and the review form, so
// they live in a module a client component can import without pulling drizzle
// into the browser bundle.
import {
  DAILY_MESSAGE_CATEGORIES,
  DAILY_MESSAGE_MAX_LENGTH,
} from "@/lib/daily-message/rules";

//
// USERS
//

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull().unique(),

  email: text("email").unique(),

  passwordHash: text("password_hash"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

//
// DEVICES
//

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    name: text("name").notNull(),

    tokenHash: text("token_hash").notNull().unique(),

    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique("devices_user_name_unique").on(table.userId, table.name)],
);

//
// MESSAGES
//


export const messages = pgTable(
  "messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => users.id),

    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),

    textContent: text("text_content"),

    bitmapData: bytea("bitmap_data")
      .notNull(),

    /** Set for snapshots uploaded by a physical FamilyScreen. */
    sourceDeviceId: uuid("source_device_id").references(() => devices.id, {
      onDelete: "set null",
    }),

    contentSha256: text("content_sha256"),

    idempotencyKey: text("idempotency_key"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    readAt: timestamp("read_at", {
      withTimezone: true,
    }),
  },

  (table) => [
    index("messages_recipient_cursor_idx").on(table.recipientUserId, table.id),
    index("messages_sender_cursor_idx").on(table.senderUserId, table.id),
  ],
);

//
// CONTACTS
//

export const contacts = pgTable(
  "contacts",
  {
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },

  (table) => [
    primaryKey({ columns: [table.userAId, table.userBId] }),
    check("contacts_canonical_order", sql`${table.userAId} < ${table.userBId}`),
    index("contacts_user_b_idx").on(table.userBId),
  ],
);

//
// DAILY MESSAGES
//

// Derived from the constant rather than spelled out a second time, so the
// validator and the database constraint cannot drift apart.
const CATEGORY_LITERALS = DAILY_MESSAGE_CATEGORIES.map(
  (category) => `'${category}'`,
).join(", ");

export const dailyMessages = pgTable(
  "daily_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    text: text("text").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("pending"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by"),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** The latest Vienna calendar day on which this message was selected. */
    lastDisplayedOn: date("last_displayed_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("daily_messages_text_unique").on(table.text),
    // PostgreSQL allows multiple NULLs but only one row for each real date.
    unique("daily_messages_last_displayed_on_unique").on(
      table.lastDisplayedOn,
    ),
    index("daily_messages_review_queue_idx").on(
      table.status,
      table.createdAt,
    ),
    check(
      "daily_messages_text_length",
      sql`char_length(btrim(${table.text})) between 1 and ${DAILY_MESSAGE_MAX_LENGTH}`,
    ),
    check(
      "daily_messages_category_valid",
      sql`${table.category} in (${sql.raw(CATEGORY_LITERALS)})`,
    ),
    check(
      "daily_messages_status_valid",
      sql`${table.status} in ('pending', 'approved', 'rejected')`,
    ),
  ],
);
