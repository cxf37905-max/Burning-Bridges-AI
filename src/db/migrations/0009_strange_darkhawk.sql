ALTER TABLE "payment" ADD COLUMN "payment_sync_id" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "webhook_processed_at" timestamp;--> statement-breakpoint
CREATE INDEX "payment_sync_id_idx" ON "payment" USING btree ("payment_sync_id");