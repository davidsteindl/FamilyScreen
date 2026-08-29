CREATE TABLE "contacts" (
	"user_a_id" uuid,
	"user_b_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_pkey" PRIMARY KEY("user_a_id","user_b_id"),
	CONSTRAINT "contacts_canonical_order" CHECK ("user_a_id" < "user_b_id")
);
--> statement-breakpoint
CREATE INDEX "contacts_user_b_idx" ON "contacts" ("user_b_id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_a_id_users_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_b_id_users_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE;