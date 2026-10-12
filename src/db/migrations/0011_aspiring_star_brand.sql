CREATE TABLE "studio_order" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"cents" integer NOT NULL,
	"videos" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"acquiring_order_id" text,
	"checkout_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_order_acquiring_order_id_unique" UNIQUE("acquiring_order_id")
);
--> statement-breakpoint
CREATE TABLE "studio_wallet" (
	"user_id" text PRIMARY KEY NOT NULL,
	"videos" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_order" ADD CONSTRAINT "studio_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_wallet" ADD CONSTRAINT "studio_wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_order_user_idx" ON "studio_order" USING btree ("user_id");