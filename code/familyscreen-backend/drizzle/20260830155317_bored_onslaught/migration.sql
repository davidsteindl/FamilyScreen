CREATE TABLE "daily_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "daily_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"text" text NOT NULL CONSTRAINT "daily_messages_text_unique" UNIQUE,
	"category" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_name" text,
	"source_url" text,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_by_name" text,
	"reviewed_at" timestamp with time zone,
	"last_displayed_on" date CONSTRAINT "daily_messages_last_displayed_on_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_messages_text_length" CHECK (char_length(btrim("text")) between 1 and 110),
	CONSTRAINT "daily_messages_category_valid" CHECK ("category" in ('dialect', 'joke', 'bonmot', 'saying')),
	CONSTRAINT "daily_messages_status_valid" CHECK ("status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX "daily_messages_review_queue_idx" ON "daily_messages" ("status","created_at");