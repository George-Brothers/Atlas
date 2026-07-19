/**
 * Deterministic grading, mastery scoring, and the mastery gate / unlock logic.
 *
 * Everything here is pure and side-effect-free so it can be unit-tested without
 * a database or an API key. The LLM only ever produces the per-criterion scores
 * for a free-text answer (see `lib/ai/grader.ts`); combining those into a
 * mastery score and deciding pass/unlock happens here, deterministically.
 */
import {
  MASTERY_THRESHOLD,
  type McqAnswerKey,
  type RubricCriterion,
} from "./types.ts";

/** Result of grading a single question. */
export interface GradedQuestion {
  /** Weight of this question toward the topic's mastery score. */
  points: number;
  /** Points actually earned (0..points). */
  earnedPoints: number;
  /** True only for a fully-correct answer (used for per-question UI). */
  isCorrect: boolean;
}

/**
 * Grade an MCQ deterministically. The whole question's points are awarded for
 * the correct choice and nothing otherwise — there is no partial credit on a
 * single-select MCQ.
 */
export function gradeMcq(
  answerKey: McqAnswerKey,
  selectedIndex: number | null | undefined,
  points = 1,
): GradedQuestion {
  const isCorrect =
    selectedIndex != null && selectedIndex === answerKey.correctIndex;
  return { points, earnedPoints: isCorrect ? points : 0, isCorrect };
}

/** A per-criterion score produced by the grader for one free-text answer. */
export interface CriterionScore {
  id: string;
  /** Points awarded for this criterion (clamped to the criterion's max). */
  awarded: number;
}

/**
 * Fold per-criterion grader scores into a single graded question. The question
 * is worth the sum of its criteria's points; `isCorrect` means full marks.
 */
export function foldFreeTextScores(
  criteria: RubricCriterion[],
  scores: CriterionScore[],
): GradedQuestion {
  const byId = new Map(scores.map((s) => [s.id, s]));
  let points = 0;
  let earned = 0;
  for (const c of criteria) {
    points += c.points;
    const awarded = byId.get(c.id)?.awarded ?? 0;
    // Never let the grader award more than a criterion is worth, or negative.
    earned += Math.max(0, Math.min(c.points, awarded));
  }
  return {
    points,
    earnedPoints: earned,
    isCorrect: points > 0 && earned >= points,
  };
}

/** Outcome of aggregating a whole quiz into a topic mastery score. */
export interface MasteryOutcome {
  /** 0..100 mastery percentage. */
  score: number;
  passed: boolean;
  earnedPoints: number;
  totalPoints: number;
}

/**
 * Aggregate graded questions into a mastery score (percent of points earned)
 * and apply the pass threshold. An empty quiz scores 0 and does not pass.
 */
export function computeMastery(
  graded: GradedQuestion[],
  threshold: number = MASTERY_THRESHOLD,
): MasteryOutcome {
  const totalPoints = graded.reduce((n, g) => n + g.points, 0);
  const earnedPoints = graded.reduce((n, g) => n + g.earnedPoints, 0);
  const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  return {
    score,
    passed: totalPoints > 0 && score >= threshold,
    earnedPoints,
    totalPoints,
  };
}

/* -------------------------------------------------------------------------- */
/* Topic gate / unlock logic (drives the dashboard status + next action).      */
/* -------------------------------------------------------------------------- */

export type TopicStatus = "mastered" | "available" | "locked";

/** Minimal topic shape the gate logic needs; slugs identify prerequisites. */
export interface TopicNode {
  slug: string;
  prereqSlugs: string[];
}

/**
 * Compute each topic's status from the prerequisite DAG and the set of already
 * mastered topics:
 *  - `mastered`  — the learner has passed this topic's gate.
 *  - `available` — every prerequisite is mastered (or there are none).
 *  - `locked`    — at least one prerequisite is not yet mastered.
 */
export function computeTopicStatuses(
  topics: TopicNode[],
  masteredSlugs: ReadonlySet<string>,
): Map<string, TopicStatus> {
  const status = new Map<string, TopicStatus>();
  for (const t of topics) {
    if (masteredSlugs.has(t.slug)) {
      status.set(t.slug, "mastered");
    } else if (t.prereqSlugs.every((p) => masteredSlugs.has(p))) {
      status.set(t.slug, "available");
    } else {
      status.set(t.slug, "locked");
    }
  }
  return status;
}

/**
 * The single next action: the first `available` topic in spine order. Returns
 * null when everything reachable is mastered (or nothing is available yet).
 */
export function nextAvailableTopic(
  topics: TopicNode[],
  masteredSlugs: ReadonlySet<string>,
): string | null {
  const status = computeTopicStatuses(topics, masteredSlugs);
  for (const t of topics) {
    if (status.get(t.slug) === "available") return t.slug;
  }
  return null;
}
