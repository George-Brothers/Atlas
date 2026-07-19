/**
 * Shared domain types for the learning loop.
 *
 * These describe the JSON payload shapes stored in the Drizzle schema's `jsonb`
 * columns (`question.answer_key`, `content_block.body`, `answer.response`, …).
 * The DB stores them untyped; these types are the single contract the app and
 * the seed script both build against.
 */

/** Question kinds the quiz engine understands. Stored in `question.type`. */
export type QuestionType = "mcq" | "free_text";

/** `question.answer_key` for an MCQ: the index of the correct choice. */
export interface McqAnswerKey {
  correctIndex: number;
}

/** One gradable dimension of a free-text answer. */
export interface RubricCriterion {
  id: string;
  description: string;
  /** Max points this criterion contributes. */
  points: number;
}

/** `question.answer_key` for a free-text question: the grading rubric. */
export interface FreeTextAnswerKey {
  criteria: RubricCriterion[];
  /** Reference notes for the grader (NOT shown to the learner). */
  guidance?: string;
}

/**
 * Mastery pass threshold (percent). Applies to level-1/2 topics, which is all
 * of Phase 1. Deeper levels (essay / level-3-4 grading) raise this later.
 */
export const MASTERY_THRESHOLD = 80;

/** Mastery levels recorded in `mastery_record.level`. */
export type MasteryLevel = "0" | "1" | "2" | "3" | "4";
