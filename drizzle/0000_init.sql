-- pgvector must exist before `source_chunk.embedding vector(1536)` and its
-- HNSW index are created below. Kept as the FIRST statement of this migration
-- on purpose. On Neon the `vector` extension is available to the app role;
-- if a re-`generate` ever rewrites this file, RE-ADD this line by hand (see README).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"response" jsonb,
	"score" numeric,
	"is_correct" boolean,
	"ai_feedback" text,
	"graded_by" text
);
--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid,
	"kind" text NOT NULL,
	"title" text,
	"passing_score" numeric,
	"generated_by_model" text
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"total_score" numeric,
	"passed" boolean
);
--> statement-breakpoint
CREATE TABLE "content_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"body" jsonb,
	"quiz_id" uuid
);
--> statement-breakpoint
CREATE TABLE "content_provenance" (
	"content_block_id" uuid NOT NULL,
	"source_chunk_id" uuid NOT NULL,
	CONSTRAINT "content_provenance_content_block_id_source_chunk_id_pk" PRIMARY KEY("content_block_id","source_chunk_id")
);
--> statement-breakpoint
CREATE TABLE "curriculum" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_by_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"goals" jsonb,
	"background" jsonb,
	"preferences" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"est_minutes" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"mastery_gate_topic_id" uuid
);
--> statement-breakpoint
CREATE TABLE "mastery_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"mastery_score" numeric,
	"level" text,
	"evidence" jsonb,
	"last_assessed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mastery_record_learner_topic_uq" UNIQUE("learner_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"title" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"learning_objectives" jsonb,
	"status" text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"choices" jsonb,
	"answer_key" jsonb,
	"topic_id" uuid,
	"points" numeric
);
--> statement-breakpoint
CREATE TABLE "research_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_id" uuid,
	"title" text,
	"url" text,
	"summary" text,
	"status" text DEFAULT 'new' NOT NULL,
	"relevance_score" numeric,
	"affects_topic_ids" jsonb,
	"proposed_action" text,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"source_question_id" uuid,
	"stability" numeric,
	"difficulty" numeric,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"last_grade" integer
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_item_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"grade" integer,
	"scheduled_interval" integer,
	"elapsed_days" integer
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"url" text,
	"author" text,
	"kind" text,
	"fetched_at" timestamp with time zone,
	"license_note" text,
	"trust_tier" text
);
--> statement-breakpoint
CREATE TABLE "source_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"token_count" integer
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"parent_topic_id" uuid,
	"description" text,
	CONSTRAINT "topic_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topic_prereq" (
	"topic_id" uuid NOT NULL,
	"prereq_topic_id" uuid NOT NULL,
	CONSTRAINT "topic_prereq_topic_id_prereq_topic_id_pk" PRIMARY KEY("topic_id","prereq_topic_id")
);
--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_block" ADD CONSTRAINT "content_block_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_block" ADD CONSTRAINT "content_block_quiz_id_assessment_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."assessment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_provenance" ADD CONSTRAINT "content_provenance_content_block_id_content_block_id_fk" FOREIGN KEY ("content_block_id") REFERENCES "public"."content_block"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_provenance" ADD CONSTRAINT "content_provenance_source_chunk_id_source_chunk_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."source_chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum" ADD CONSTRAINT "curriculum_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_response" ADD CONSTRAINT "intake_response_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_mastery_gate_topic_id_topic_id_fk" FOREIGN KEY ("mastery_gate_topic_id") REFERENCES "public"."topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_record" ADD CONSTRAINT "mastery_record_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mastery_record" ADD CONSTRAINT "mastery_record_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_curriculum_id_curriculum_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculum"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_item" ADD CONSTRAINT "research_item_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_source_question_id_question_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."question"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_review_item_id_review_item_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."review_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunk" ADD CONSTRAINT "source_chunk_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_parent_topic_id_topic_id_fk" FOREIGN KEY ("parent_topic_id") REFERENCES "public"."topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_prereq" ADD CONSTRAINT "topic_prereq_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_prereq" ADD CONSTRAINT "topic_prereq_prereq_topic_id_topic_id_fk" FOREIGN KEY ("prereq_topic_id") REFERENCES "public"."topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_attempt_id_idx" ON "answer" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "answer_question_id_idx" ON "answer" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "assessment_lesson_id_idx" ON "assessment" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "attempt_learner_id_idx" ON "attempt" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "attempt_assessment_id_idx" ON "attempt" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "content_block_lesson_id_idx" ON "content_block" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "content_block_quiz_id_idx" ON "content_block" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "content_provenance_source_chunk_id_idx" ON "content_provenance" USING btree ("source_chunk_id");--> statement-breakpoint
CREATE INDEX "curriculum_learner_id_idx" ON "curriculum" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "intake_response_learner_id_idx" ON "intake_response" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "lesson_module_id_idx" ON "lesson" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "lesson_mastery_gate_topic_id_idx" ON "lesson" USING btree ("mastery_gate_topic_id");--> statement-breakpoint
CREATE INDEX "mastery_record_learner_topic_idx" ON "mastery_record" USING btree ("learner_id","topic_id");--> statement-breakpoint
CREATE INDEX "mastery_record_topic_id_idx" ON "mastery_record" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "module_curriculum_id_idx" ON "module" USING btree ("curriculum_id");--> statement-breakpoint
CREATE INDEX "question_assessment_id_idx" ON "question" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "question_topic_id_idx" ON "question" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "research_item_source_id_idx" ON "research_item" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "review_item_learner_due_idx" ON "review_item" USING btree ("learner_id","due_at");--> statement-breakpoint
CREATE INDEX "review_item_topic_id_idx" ON "review_item" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "review_item_source_question_id_idx" ON "review_item" USING btree ("source_question_id");--> statement-breakpoint
CREATE INDEX "review_log_review_item_id_idx" ON "review_log" USING btree ("review_item_id");--> statement-breakpoint
CREATE INDEX "source_chunk_source_id_idx" ON "source_chunk" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_chunk_embedding_hnsw_idx" ON "source_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "topic_parent_topic_id_idx" ON "topic" USING btree ("parent_topic_id");--> statement-breakpoint
CREATE INDEX "topic_prereq_prereq_topic_id_idx" ON "topic_prereq" USING btree ("prereq_topic_id");