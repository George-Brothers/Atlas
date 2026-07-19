ALTER TABLE "source" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_topic_id_idx" ON "source" USING btree ("topic_id");