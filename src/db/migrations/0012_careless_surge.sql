CREATE TABLE "studio_video" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"photo_hash" text NOT NULL,
	"reference_url" text NOT NULL,
	"request_body" jsonb,
	"provider_task_id" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"video_url" text,
	"failure_reason" text,
	"refunded_at" timestamp with time zone,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_video_provider_task_id_unique" UNIQUE("provider_task_id")
);
--> statement-breakpoint
ALTER TABLE "studio_video" ADD CONSTRAINT "studio_video_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_video_user_idx" ON "studio_video" USING btree ("user_id");