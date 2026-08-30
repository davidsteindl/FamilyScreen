import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  bytea,
  index,
  unique,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
