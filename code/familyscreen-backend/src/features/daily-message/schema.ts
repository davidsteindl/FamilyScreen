import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import {
  DAILY_MESSAGE_CATEGORIES,
  DAILY_MESSAGE_MAX_LENGTH,
} from "./validation";

// Derived from the constant rather than spelled out a second time, so the
// validator and the database constraint cannot drift apart.
const CATEGORY_LITERALS = DAILY_MESSAGE_CATEGORIES.map(
  (category) => `'${category}'`,
).join(", ");

/** Kept in its own feature file, but migrated into the existing application DB. */
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
