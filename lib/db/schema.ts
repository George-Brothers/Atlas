/**
 * atlas database schema (Drizzle ORM, Neon Postgres).
 *
 * Phase 0 defines the FULL schema up front — including tables that stay empty
 * until later phases (learning loop, FSRS review, research ingestion). Creating
 * them now is cheap and avoids a migration churn later.
 *
 * Conventions:
 *  - Primary keys are uuid, generated with `gen_random_uuid()` (built into
 *    Postgres 13+, which Neon provides).
 *  - All timestamps are `timestamptz` (`withTimezone: true`).
 *  - JSON payloads use `jsonb`.
 *  - `source_chunk.embedding` uses pgvector `vector(1536)`; the `vector`
 *    extension is enabled as the first statement of the initial migration.
 *  - btree indexes are added on foreign-key columns and the hot lookup paths
 *    called out in the build plan.
 */
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  numeric,
  boolean,
  vector,
  index,
  unique,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Shared helpers so every table reads the same way. */
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const id = () => uuid("id").primaryKey().defaultRandom();

/* -------------------------------------------------------------------------- */
/* Learner + intake                                                            */
/* -------------------------------------------------------------------------- */

export const learner = pgTable("learner", {
  id: id(),
  displayName: text("display_name"),
  goals: jsonb("goals"),
  background: jsonb("background"),
  preferences: jsonb("preferences"),
  createdAt: createdAt(),
});

export const intakeResponse = pgTable(
  "intake_response",
  {
    id: id(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    answer: text("answer"),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("intake_response_learner_id_idx").on(t.learnerId)],
);

/* -------------------------------------------------------------------------- */
/* Curriculum -> module -> lesson -> content_block                             */
/* -------------------------------------------------------------------------- */

export const curriculum = pgTable(
  "curriculum",
  {
    id: id(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status").notNull().default("draft"),
    generatedByModel: text("generated_by_model"),
    createdAt: createdAt(),
  },
  (t) => [index("curriculum_learner_id_idx").on(t.learnerId)],
);

// Exported as `courseModule` (not `module`) to avoid shadowing the module
// system; the SQL table is still named "module".
export const courseModule = pgTable(
  "module",
  {
    id: id(),
    curriculumId: uuid("curriculum_id")
      .notNull()
      .references(() => curriculum.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    learningObjectives: jsonb("learning_objectives"),
    status: text("status").notNull().default("draft"),
  },
  (t) => [index("module_curriculum_id_idx").on(t.curriculumId)],
);

export const lesson = pgTable(
  "lesson",
  {
    id: id(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => courseModule.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    estMinutes: integer("est_minutes"),
    status: text("status").notNull().default("draft"),
    masteryGateTopicId: uuid("mastery_gate_topic_id").references(
      (): AnyPgColumn => topic.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    index("lesson_module_id_idx").on(t.moduleId),
    index("lesson_mastery_gate_topic_id_idx").on(t.masteryGateTopicId),
  ],
);

export const contentBlock = pgTable(
  "content_block",
  {
    id: id(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    kind: text("kind").notNull(),
    body: jsonb("body"),
    quizId: uuid("quiz_id").references((): AnyPgColumn => assessment.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("content_block_lesson_id_idx").on(t.lessonId),
    index("content_block_quiz_id_idx").on(t.quizId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Topic graph + mastery                                                       */
/* -------------------------------------------------------------------------- */

export const topic = pgTable(
  "topic",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    parentTopicId: uuid("parent_topic_id").references(
      (): AnyPgColumn => topic.id,
      { onDelete: "set null" },
    ),
    description: text("description"),
  },
  (t) => [index("topic_parent_topic_id_idx").on(t.parentTopicId)],
);

export const topicPrereq = pgTable(
  "topic_prereq",
  {
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topic.id, { onDelete: "cascade" }),
    prereqTopicId: uuid("prereq_topic_id")
      .notNull()
      .references(() => topic.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.topicId, t.prereqTopicId] }),
    index("topic_prereq_prereq_topic_id_idx").on(t.prereqTopicId),
  ],
);

export const masteryRecord = pgTable(
  "mastery_record",
  {
    id: id(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topic.id, { onDelete: "cascade" }),
    masteryScore: numeric("mastery_score"),
    level: text("level"),
    evidence: jsonb("evidence"),
    lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("mastery_record_learner_topic_uq").on(t.learnerId, t.topicId),
    index("mastery_record_learner_topic_idx").on(t.learnerId, t.topicId),
    index("mastery_record_topic_id_idx").on(t.topicId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Spaced repetition (FSRS)                                                     */
/* -------------------------------------------------------------------------- */

export const reviewItem = pgTable(
  "review_item",
  {
    id: id(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topic.id, { onDelete: "cascade" }),
    sourceQuestionId: uuid("source_question_id").references(
      (): AnyPgColumn => question.id,
      { onDelete: "set null" },
    ),
    // FSRS memory state.
    stability: numeric("stability"),
    difficulty: numeric("difficulty"),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    lastGrade: integer("last_grade"),
  },
  (t) => [
    index("review_item_learner_due_idx").on(t.learnerId, t.dueAt),
    index("review_item_topic_id_idx").on(t.topicId),
    index("review_item_source_question_id_idx").on(t.sourceQuestionId),
  ],
);

export const reviewLog = pgTable(
  "review_log",
  {
    id: id(),
    reviewItemId: uuid("review_item_id")
      .notNull()
      .references(() => reviewItem.id, { onDelete: "cascade" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    grade: integer("grade"),
    scheduledInterval: integer("scheduled_interval"),
    elapsedDays: integer("elapsed_days"),
  },
  (t) => [index("review_log_review_item_id_idx").on(t.reviewItemId)],
);

/* -------------------------------------------------------------------------- */
/* Assessments -> questions -> attempts -> answers                             */
/* -------------------------------------------------------------------------- */

export const assessment = pgTable(
  "assessment",
  {
    id: id(),
    lessonId: uuid("lesson_id").references(() => lesson.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    title: text("title"),
    passingScore: numeric("passing_score"),
    generatedByModel: text("generated_by_model"),
  },
  (t) => [index("assessment_lesson_id_idx").on(t.lessonId)],
);

export const question = pgTable(
  "question",
  {
    id: id(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessment.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    type: text("type").notNull(),
    prompt: text("prompt").notNull(),
    choices: jsonb("choices"),
    answerKey: jsonb("answer_key"),
    topicId: uuid("topic_id").references(() => topic.id, {
      onDelete: "set null",
    }),
    points: numeric("points"),
  },
  (t) => [
    index("question_assessment_id_idx").on(t.assessmentId),
    index("question_topic_id_idx").on(t.topicId),
  ],
);

export const attempt = pgTable(
  "attempt",
  {
    id: id(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessment.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    status: text("status").notNull().default("in_progress"),
    totalScore: numeric("total_score"),
    passed: boolean("passed"),
  },
  (t) => [
    index("attempt_learner_id_idx").on(t.learnerId),
    index("attempt_assessment_id_idx").on(t.assessmentId),
  ],
);

export const answer = pgTable(
  "answer",
  {
    id: id(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempt.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    response: jsonb("response"),
    score: numeric("score"),
    isCorrect: boolean("is_correct"),
    aiFeedback: text("ai_feedback"),
    gradedBy: text("graded_by"),
  },
  (t) => [
    index("answer_attempt_id_idx").on(t.attemptId),
    index("answer_question_id_idx").on(t.questionId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Sources, chunks (pgvector), provenance                                      */
/* -------------------------------------------------------------------------- */

export const source = pgTable(
  "source",
  {
    id: id(),
    title: text("title"),
    url: text("url"),
    author: text("author"),
    kind: text("kind"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    licenseNote: text("license_note"),
    trustTier: text("trust_tier"),
    // The spine topic this source is about, when known. Set for the authored
    // lesson corpus (M4 ingestion) so retrieval can scope to a topic and cite
    // it; left null for external/research sources that predate a topic mapping.
    topicId: uuid("topic_id").references(() => topic.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("source_topic_id_idx").on(t.topicId)],
);

export const sourceChunk = pgTable(
  "source_chunk",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    // pgvector column; requires the `vector` extension (enabled in migration).
    embedding: vector("embedding", { dimensions: 1536 }),
    tokenCount: integer("token_count"),
  },
  (t) => [
    index("source_chunk_source_id_idx").on(t.sourceId),
    // HNSW index for cosine-similarity ANN search over embeddings.
    index("source_chunk_embedding_hnsw_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const contentProvenance = pgTable(
  "content_provenance",
  {
    contentBlockId: uuid("content_block_id")
      .notNull()
      .references(() => contentBlock.id, { onDelete: "cascade" }),
    sourceChunkId: uuid("source_chunk_id")
      .notNull()
      .references(() => sourceChunk.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.contentBlockId, t.sourceChunkId] }),
    index("content_provenance_source_chunk_id_idx").on(t.sourceChunkId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Research ingestion queue                                                    */
/* -------------------------------------------------------------------------- */

export const researchItem = pgTable(
  "research_item",
  {
    id: id(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sourceId: uuid("source_id").references(() => source.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    url: text("url"),
    summary: text("summary"),
    status: text("status").notNull().default("new"),
    relevanceScore: numeric("relevance_score"),
    affectsTopicIds: jsonb("affects_topic_ids"),
    proposedAction: text("proposed_action"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("research_item_source_id_idx").on(t.sourceId)],
);
