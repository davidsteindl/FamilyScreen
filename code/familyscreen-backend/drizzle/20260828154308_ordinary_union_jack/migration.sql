ALTER TABLE "messages" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bitmap_data" bytea NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "payload";--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_name_unique" UNIQUE("user_id","name");