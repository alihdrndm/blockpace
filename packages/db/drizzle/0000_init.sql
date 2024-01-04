CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"block_id" uuid NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_events_block_id_type_dedupe_key_unique" UNIQUE("block_id","type","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "block_nights" (
	"block_id" uuid NOT NULL,
	"night" date NOT NULL,
	"contracted_rooms" integer NOT NULL,
	"rate_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "block_nights_pkey" PRIMARY KEY("block_id","night")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hotel_name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"cutoff_date" date NOT NULL,
	"status" text NOT NULL,
	"basis" text NOT NULL,
	"allowed_attrition_bps" integer NOT NULL,
	"damages_bps" integer NOT NULL,
	"tax_bps" integer NOT NULL,
	"resell_credit" boolean NOT NULL,
	"minimum_rounding" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_status_check" CHECK ("blocks"."status" in ('active', 'closed')),
	CONSTRAINT "blocks_basis_check" CHECK ("blocks"."basis" in ('cumulative', 'per_night')),
	CONSTRAINT "blocks_minimum_rounding_check" CHECK ("blocks"."minimum_rounding" in ('ceil', 'floor', 'round')),
	CONSTRAINT "blocks_allowed_attrition_bps_check" CHECK ("blocks"."allowed_attrition_bps" between 0 and 10000),
	CONSTRAINT "blocks_damages_bps_check" CHECK ("blocks"."damages_bps" between 0 and 10000),
	CONSTRAINT "blocks_tax_bps_check" CHECK ("blocks"."tax_bps" between 0 and 5000)
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"block_id" uuid NOT NULL,
	"evaluated_for" date NOT NULL,
	"risk_level" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_block_id_evaluated_for_unique" UNIQUE("block_id","evaluated_for"),
	CONSTRAINT "evaluations_risk_level_check" CHECK ("evaluations"."risk_level" in ('met', 'on_track', 'at_risk', 'liable'))
);
--> statement-breakpoint
CREATE TABLE "snapshot_nights" (
	"snapshot_id" uuid NOT NULL,
	"night" date NOT NULL,
	"picked_up_rooms" integer NOT NULL,
	"resold_rooms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_nights_pkey" PRIMARY KEY("snapshot_id","night")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"block_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshots_block_id_as_of_date_unique" UNIQUE("block_id","as_of_date"),
	CONSTRAINT "snapshots_source_check" CHECK ("snapshots"."source" in ('manual', 'csv', 'api'))
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"alert_event_id" uuid,
	"event_type" text NOT NULL,
	"body" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_status_code" integer,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_status_check" CHECK ("webhook_deliveries"."status" in ('pending', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_nights" ADD CONSTRAINT "block_nights_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_nights" ADD CONSTRAINT "snapshot_nights_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_alert_event_id_alert_events_id_fk" FOREIGN KEY ("alert_event_id") REFERENCES "public"."alert_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");