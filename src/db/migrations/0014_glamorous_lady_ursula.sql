DROP INDEX IF EXISTS "user_credit_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_credit_user_id_unique" ON "user_credit" USING btree ("user_id");
