import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  bytea,
  index,
  unique,
} from "drizzle-orm/pg-core";

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

    payload: bytea("payload").notNull(),

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
  ],
);
