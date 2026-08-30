ALTER TABLE "messages" ADD COLUMN "source_device_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "content_sha256" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_device_idempotency_recipient_unique" UNIQUE("source_device_id","idempotency_key","recipient_user_id");--> statement-breakpoint
CREATE INDEX "messages_sender_cursor_idx" ON "messages" ("sender_user_id","id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_source_device_id_devices_id_fkey" FOREIGN KEY ("source_device_id") REFERENCES "devices"("id") ON DELETE SET NULL;