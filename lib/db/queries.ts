/**
 * Read-side data access for the learning loop.
 *
 * Server Components and Server Actions call these instead of touching Drizzle
 * directly, so query shapes live in one place. Every function needs a live DB
 * (`getDb()` throws without `DATABASE_URL`). Writes (intake, quiz submission)
 * live with their Server Actions, not here.
 */
import "server-only";
import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import { getDb } from "./index";
import {
  answer,
  assessment,
  attempt,
  contentBlock,
  courseModule,
  curriculum,
  intakeResponse,
  learner,
  lesson,
  masteryRecord,
  question,
  reviewItem,
  reviewLog,
  topic,
  topicPrereq,
} from "./schema";
import {
  computeTopicStatuses,
  nextAvailableTopic,
  type TopicStatus,
} from "@/lib/learning/mastery";
import { MASTERY_THRESHOLD } from "@/lib/learning/types";
import { MIN_STABILITY } from "@/lib/learning/fsrs";
import { SPINE } from "@/lib/content/spine";

/** The single-user learner (first row), or null before intake seeds one. */
export async function getLearner() {
  const db = getDb();
  const rows = await db.select().from(learner).limit(1);
  return rows[0] ?? null;
}

/** Intake is "complete" once the learner has recorded any intake response. */
export async function isIntakeComplete(learnerId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: intakeResponse.id })
    .from(intakeResponse)
    .where(eq(intakeResponse.learnerId, learnerId))
    .limit(1);
  return rows.length > 0;
}

/** Slugs of topics the learner has mastered (score ≥ threshold). */
export async function getMasteredTopicSlugs(
  learnerId: string,
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ slug: topic.slug, score: masteryRecord.masteryScore })
    .from(masteryRecord)
    .innerJoin(topic, eq(masteryRecord.topicId, topic.id))
    .where(eq(masteryRecord.learnerId, learnerId));
  const mastered = new Set<string>();
  for (const r of rows) {
    if (r.score != null && Number(r.score) >= MASTERY_THRESHOLD) {
      mastered.add(r.slug);
    }
  }
  return mastered;
}

/** Resolve a topic slug to its id (for scoping tutor retrieval to a topic). */
export async function getTopicIdBySlug(slug: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: topic.id })
    .from(topic)
    .where(eq(topic.slug, slug))
    .limit(1);
  return row?.id ?? null;
}

export interface SpineTopicView {
  slug: string;
  title: string;
  description: string | null;
  status: TopicStatus;
  masteryScore: number | null;
  lessonId: string | null;
  lessonStatus: string | null;
}

export interface DashboardData {
  topics: SpineTopicView[];
  nextTopicSlug: string | null;
  nextLessonId: string | null;
  masteredCount: number;
  totalCount: number;
  /** Number of spaced-repetition review cards due now (for the review CTA). */
  dueReviewCount: number;
}

/** Rank topics by their position in the authored spine (unknowns sort last). */
function spineIndex(slug: string): number {
  const i = SPINE.findIndex((t) => t.slug === slug);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * The dashboard payload: every spine topic with its status (locked / available
 * / mastered), the lesson that gates it, and the single next action.
 */
export async function getDashboard(learnerId: string): Promise<DashboardData> {
  const db = getDb();

  const [topics, prereqEdges, masteryRows, lessonRows, dueReviewCount] =
    await Promise.all([
    db.select().from(topic),
    db.select().from(topicPrereq),
    db
      .select({ topicId: masteryRecord.topicId, score: masteryRecord.masteryScore })
      .from(masteryRecord)
      .where(eq(masteryRecord.learnerId, learnerId)),
    // Lessons in this learner's curriculum, keyed by the topic they gate.
    db
      .select({
        id: lesson.id,
        status: lesson.status,
        gateTopicId: lesson.masteryGateTopicId,
      })
      .from(lesson)
      .innerJoin(courseModule, eq(lesson.moduleId, courseModule.id))
      .innerJoin(curriculum, eq(courseModule.curriculumId, curriculum.id))
      .where(eq(curriculum.learnerId, learnerId)),
    countDueReviews(learnerId),
  ]);

  const prereqSlugsByTopicId = new Map<string, string[]>();
  const slugById = new Map(topics.map((t) => [t.id, t.slug]));
  for (const e of prereqEdges) {
    const list = prereqSlugsByTopicId.get(e.topicId) ?? [];
    const prereqSlug = slugById.get(e.prereqTopicId);
    if (prereqSlug) list.push(prereqSlug);
    prereqSlugsByTopicId.set(e.topicId, list);
  }

  const nodes = topics.map((t) => ({
    slug: t.slug,
    prereqSlugs: prereqSlugsByTopicId.get(t.id) ?? [],
  }));

  const masteredSlugs = new Set<string>();
  const scoreByTopicId = new Map<string, number>();
  for (const m of masteryRows) {
    const score = m.score == null ? null : Number(m.score);
    if (score != null) scoreByTopicId.set(m.topicId, score);
    const slug = slugById.get(m.topicId);
    if (slug && score != null && score >= MASTERY_THRESHOLD) {
      masteredSlugs.add(slug);
    }
  }

  const statusMap = computeTopicStatuses(nodes, masteredSlugs);
  const lessonByTopicId = new Map(
    lessonRows
      .filter((l) => l.gateTopicId != null)
      .map((l) => [l.gateTopicId as string, l]),
  );

  const topicViews: SpineTopicView[] = topics
    .map((t): SpineTopicView => {
      const lessonRow = lessonByTopicId.get(t.id);
      return {
        slug: t.slug,
        title: t.title,
        description: t.description,
        status: statusMap.get(t.slug) ?? "locked",
        masteryScore: scoreByTopicId.get(t.id) ?? null,
        lessonId: lessonRow?.id ?? null,
        lessonStatus: lessonRow?.status ?? null,
      };
    })
    .sort((a, b) => spineIndex(a.slug) - spineIndex(b.slug));

  const nextTopicSlug = nextAvailableTopic(nodes, masteredSlugs);
  const nextLessonId =
    topicViews.find((t) => t.slug === nextTopicSlug)?.lessonId ?? null;

  return {
    topics: topicViews,
    nextTopicSlug,
    nextLessonId,
    masteredCount: masteredSlugs.size,
    totalCount: topics.length,
    dueReviewCount,
  };
}

export interface LessonBlock {
  id: string;
  kind: string;
  body: unknown;
}

export interface LessonView {
  id: string;
  title: string;
  status: string;
  objectives: string[];
  topicSlug: string | null;
  topicTitle: string | null;
  blocks: LessonBlock[];
  assessmentId: string | null;
}

/** A lesson with its ordered content blocks, gate topic, and quiz id. */
export async function getLessonView(
  lessonId: string,
): Promise<LessonView | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: lesson.id,
      title: lesson.title,
      status: lesson.status,
      objectives: courseModule.learningObjectives,
      gateTopicId: lesson.masteryGateTopicId,
    })
    .from(lesson)
    .innerJoin(courseModule, eq(lesson.moduleId, courseModule.id))
    .where(eq(lesson.id, lessonId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [blocks, topicRow, assessmentRow] = await Promise.all([
    db
      .select({
        id: contentBlock.id,
        kind: contentBlock.kind,
        body: contentBlock.body,
      })
      .from(contentBlock)
      .where(eq(contentBlock.lessonId, lessonId))
      .orderBy(asc(contentBlock.orderIndex)),
    row.gateTopicId
      ? db
          .select({ slug: topic.slug, title: topic.title })
          .from(topic)
          .where(eq(topic.id, row.gateTopicId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ id: assessment.id })
      .from(assessment)
      .where(eq(assessment.lessonId, lessonId))
      .limit(1),
  ]);

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    // Objectives are authored at the module level in Phase 1.
    objectives: Array.isArray(row.objectives)
      ? (row.objectives as string[])
      : [],
    topicSlug: topicRow[0]?.slug ?? null,
    topicTitle: topicRow[0]?.title ?? null,
    blocks: blocks as LessonBlock[],
    assessmentId: assessmentRow[0]?.id ?? null,
  };
}

export interface QuizQuestion {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  points: number;
}

export interface QuizView {
  assessmentId: string;
  lessonId: string;
  title: string | null;
  gateTopicId: string | null;
  questions: QuizQuestion[];
}

/** The quiz for a lesson: assessment + ordered questions (no answer keys). */
export async function getQuizForLesson(
  lessonId: string,
): Promise<QuizView | null> {
  const db = getDb();
  const rows = await db
    .select({
      assessmentId: assessment.id,
      title: assessment.title,
      gateTopicId: lesson.masteryGateTopicId,
    })
    .from(assessment)
    .innerJoin(lesson, eq(assessment.lessonId, lesson.id))
    .where(eq(assessment.lessonId, lessonId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const questions = await db
    .select({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      choices: question.choices,
      points: question.points,
    })
    .from(question)
    .where(eq(question.assessmentId, row.assessmentId))
    .orderBy(asc(question.orderIndex));

  return {
    assessmentId: row.assessmentId,
    lessonId,
    title: row.title,
    gateTopicId: row.gateTopicId,
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      choices: Array.isArray(q.choices) ? (q.choices as string[]) : null,
      points: q.points == null ? 1 : Number(q.points),
    })),
  };
}

export interface AnswerResult {
  questionId: string;
  prompt: string;
  type: string;
  choices: string[] | null;
  response: unknown;
  score: number | null;
  isCorrect: boolean | null;
  aiFeedback: string | null;
  gradedBy: string | null;
  points: number;
  correctIndex: number | null;
}

export interface AttemptResult {
  attemptId: string;
  lessonId: string | null;
  totalScore: number | null;
  passed: boolean | null;
  answers: AnswerResult[];
}

/** A graded attempt with per-question results, for the results view. */
export async function getAttemptResult(
  attemptId: string,
): Promise<AttemptResult | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: attempt.id,
      assessmentId: attempt.assessmentId,
      totalScore: attempt.totalScore,
      passed: attempt.passed,
    })
    .from(attempt)
    .where(eq(attempt.id, attemptId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [lessonRow, answerRows] = await Promise.all([
    db
      .select({ lessonId: assessment.lessonId })
      .from(assessment)
      .where(eq(assessment.id, row.assessmentId))
      .limit(1),
    db
      .select({
        questionId: answer.questionId,
        response: answer.response,
        score: answer.score,
        isCorrect: answer.isCorrect,
        aiFeedback: answer.aiFeedback,
        gradedBy: answer.gradedBy,
        prompt: question.prompt,
        type: question.type,
        choices: question.choices,
        points: question.points,
        answerKey: question.answerKey,
        orderIndex: question.orderIndex,
      })
      .from(answer)
      .innerJoin(question, eq(answer.questionId, question.id))
      .where(eq(answer.attemptId, attemptId))
      .orderBy(asc(question.orderIndex)),
  ]);

  return {
    attemptId: row.id,
    lessonId: lessonRow[0]?.lessonId ?? null,
    totalScore: row.totalScore == null ? null : Number(row.totalScore),
    passed: row.passed,
    answers: answerRows.map((a): AnswerResult => {
      const key = a.answerKey as { correctIndex?: number } | null;
      return {
        questionId: a.questionId,
        prompt: a.prompt,
        type: a.type,
        choices: Array.isArray(a.choices) ? (a.choices as string[]) : null,
        response: a.response,
        score: a.score == null ? null : Number(a.score),
        isCorrect: a.isCorrect,
        aiFeedback: a.aiFeedback,
        gradedBy: a.gradedBy,
        points: a.points == null ? 1 : Number(a.points),
        correctIndex:
          a.type === "mcq" && key?.correctIndex != null
            ? key.correctIndex
            : null,
      };
    }),
  };
}

/**
 * Load everything the grading Server Action needs: the assessment, its lesson +
 * gate topic, and the full questions (answer keys + rubrics included).
 */
export async function getGradingData(assessmentId: string) {
  const db = getDb();
  const [assessmentRow] = await db
    .select({
      id: assessment.id,
      lessonId: assessment.lessonId,
      passingScore: assessment.passingScore,
      gateTopicId: lesson.masteryGateTopicId,
    })
    .from(assessment)
    .innerJoin(lesson, eq(assessment.lessonId, lesson.id))
    .where(eq(assessment.id, assessmentId))
    .limit(1);
  if (!assessmentRow) return null;

  const questions = await db
    .select()
    .from(question)
    .where(eq(question.assessmentId, assessmentId))
    .orderBy(asc(question.orderIndex));

  return { assessment: assessmentRow, questions };
}

/* -------------------------------------------------------------------------- */
/* Spaced-repetition review loop (FSRS).                                       */
/* -------------------------------------------------------------------------- */

/** Count of the learner's review cards that are due now (`due_at <= now`). */
export async function countDueReviews(
  learnerId: string,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(reviewItem)
    .where(
      and(eq(reviewItem.learnerId, learnerId), lte(reviewItem.dueAt, now)),
    );
  return row?.n ?? 0;
}

export interface DueReviewCard {
  reviewItemId: string;
  topicTitle: string | null;
  question: QuizQuestion;
}

/**
 * The learner's due review cards (oldest-due first), each with the source
 * question presented like a quiz item — WITHOUT its answer key. Re-grading
 * loads the key separately in the Server Action (`getReviewGradingData`).
 */
export async function getDueReviews(
  learnerId: string,
  now: Date = new Date(),
): Promise<DueReviewCard[]> {
  const db = getDb();
  const rows = await db
    .select({
      reviewItemId: reviewItem.id,
      topicTitle: topic.title,
      qId: question.id,
      qType: question.type,
      qPrompt: question.prompt,
      qChoices: question.choices,
      qPoints: question.points,
    })
    .from(reviewItem)
    .innerJoin(question, eq(reviewItem.sourceQuestionId, question.id))
    .leftJoin(topic, eq(reviewItem.topicId, topic.id))
    .where(and(eq(reviewItem.learnerId, learnerId), lte(reviewItem.dueAt, now)))
    .orderBy(asc(reviewItem.dueAt));

  return rows.map((r) => ({
    reviewItemId: r.reviewItemId,
    topicTitle: r.topicTitle,
    question: {
      id: r.qId,
      type: r.qType,
      prompt: r.qPrompt,
      choices: Array.isArray(r.qChoices) ? (r.qChoices as string[]) : null,
      points: r.qPoints == null ? 1 : Number(r.qPoints),
    },
  }));
}

export interface ReviewGradingData {
  item: {
    id: string;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    dueAt: Date | null;
    lastReviewedAt: Date | null;
  };
  question: typeof question.$inferSelect;
}

/**
 * Everything the review Server Action needs to grade one card: the FSRS memory
 * state of the `review_item` and the full source question (answer key + rubric
 * included). Scoped to the learner so one learner cannot grade another's card;
 * returns null if the card is missing, not theirs, or has no source question.
 */
export async function getReviewGradingData(
  reviewItemId: string,
  learnerId: string,
): Promise<ReviewGradingData | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: reviewItem.id,
      stability: reviewItem.stability,
      difficulty: reviewItem.difficulty,
      reps: reviewItem.reps,
      lapses: reviewItem.lapses,
      dueAt: reviewItem.dueAt,
      lastReviewedAt: reviewItem.lastReviewedAt,
      question: question,
    })
    .from(reviewItem)
    .innerJoin(question, eq(reviewItem.sourceQuestionId, question.id))
    .where(
      and(eq(reviewItem.id, reviewItemId), eq(reviewItem.learnerId, learnerId)),
    )
    .limit(1);
  if (!row) return null;

  return {
    item: {
      id: row.id,
      // Seeded cards always carry numeric stability/difficulty; default defensively.
      stability: row.stability == null ? MIN_STABILITY : Number(row.stability),
      difficulty: row.difficulty == null ? 5 : Number(row.difficulty),
      reps: row.reps,
      lapses: row.lapses,
      dueAt: row.dueAt,
      lastReviewedAt: row.lastReviewedAt,
    },
    question: row.question,
  };
}

export interface ReviewResult {
  reviewItemId: string;
  topicTitle: string | null;
  question: {
    id: string;
    type: string;
    prompt: string;
    choices: string[] | null;
    correctIndex: number | null;
  };
  lastGrade: number | null;
  dueAt: Date | null;
  scheduledInterval: number | null;
  elapsedDays: number | null;
}

/**
 * The just-graded card, for the `/review?graded=` confirmation: the (now
 * updated) `review_item` plus its most recent `review_log` row. Scoped to the
 * learner.
 */
export async function getReviewResult(
  reviewItemId: string,
  learnerId: string,
): Promise<ReviewResult | null> {
  const db = getDb();
  const [row] = await db
    .select({
      reviewItemId: reviewItem.id,
      lastGrade: reviewItem.lastGrade,
      dueAt: reviewItem.dueAt,
      topicTitle: topic.title,
      qId: question.id,
      qType: question.type,
      qPrompt: question.prompt,
      qChoices: question.choices,
      qAnswerKey: question.answerKey,
    })
    .from(reviewItem)
    .innerJoin(question, eq(reviewItem.sourceQuestionId, question.id))
    .leftJoin(topic, eq(reviewItem.topicId, topic.id))
    .where(
      and(eq(reviewItem.id, reviewItemId), eq(reviewItem.learnerId, learnerId)),
    )
    .limit(1);
  if (!row) return null;

  const [log] = await db
    .select({
      scheduledInterval: reviewLog.scheduledInterval,
      elapsedDays: reviewLog.elapsedDays,
    })
    .from(reviewLog)
    .where(eq(reviewLog.reviewItemId, reviewItemId))
    .orderBy(desc(reviewLog.reviewedAt))
    .limit(1);

  const key = row.qAnswerKey as { correctIndex?: number } | null;
  return {
    reviewItemId: row.reviewItemId,
    topicTitle: row.topicTitle,
    question: {
      id: row.qId,
      type: row.qType,
      prompt: row.qPrompt,
      choices: Array.isArray(row.qChoices) ? (row.qChoices as string[]) : null,
      correctIndex:
        row.qType === "mcq" && key?.correctIndex != null
          ? key.correctIndex
          : null,
    },
    lastGrade: row.lastGrade,
    dueAt: row.dueAt,
    scheduledInterval: log?.scheduledInterval ?? null,
    elapsedDays: log?.elapsedDays ?? null,
  };
}
