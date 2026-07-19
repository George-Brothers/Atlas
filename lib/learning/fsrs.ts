/**
 * FSRS-5 scheduling math: initial seeding AND the review-update step.
 *
 * Seeding (`initialReviewState`) produces the memory state for a freshly-earned
 * card; the review-update step (`reviewUpdate`) recomputes stability, difficulty,
 * and the next interval each time a due card is graded. Default FSRS-5 weights
 * and a 0.9 requested retention are used; both are overridable.
 *
 * Reference: the open-source FSRS-5 algorithm (github.com/open-spaced-repetition).
 * Pure and deterministic (given a `now`) so it is unit-tested without a DB.
 */

/** FSRS-5 default weights (w[0..18]). */
export const FSRS5_DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655,
  0.6621,
];

/** Forgetting-curve constants shared by FSRS-4.5/5. */
export const FSRS_DECAY = -0.5;
/** FACTOR = 0.9^(1/DECAY) − 1, so that interval == stability at R = 0.9. */
export const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1;

export const DEFAULT_REQUEST_RETENTION = 0.9;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;
export const MIN_STABILITY = 0.01;

/** Review grade: 1=Again, 2=Hard, 3=Good, 4=Easy. */
export type FsrsGrade = 1 | 2 | 3 | 4;

/** Human labels for the four grades (for the review UI). */
export const FSRS_GRADE_LABELS: Record<FsrsGrade, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

/**
 * Map a graded score (earned / total points) onto an FSRS grade. Review cards
 * are auto-graded from correctness rather than a self-rated button, so the four
 * bands are derived deterministically: a perfect answer is Easy, a solid pass
 * is Good, a partial answer is Hard, and a failed recall is Again. An empty
 * (zero-point) question counts as a lapse.
 */
export function reviewGradeFromScore(
  earnedPoints: number,
  totalPoints: number,
): FsrsGrade {
  if (totalPoints <= 0) return 1;
  const frac = earnedPoints / totalPoints;
  if (frac >= 1) return 4;
  if (frac >= 0.8) return 3;
  if (frac >= 0.5) return 2;
  return 1;
}

function clampDifficulty(d: number): number {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, d));
}

/** Initial stability S₀(G) = w[G−1] for the first rating G. */
export function initialStability(
  grade: FsrsGrade,
  w: readonly number[] = FSRS5_DEFAULT_WEIGHTS,
): number {
  return Math.max(MIN_STABILITY, w[grade - 1]);
}

/** Initial difficulty D₀(G) = w[4] − exp(w[5]·(G−1)) + 1, clamped to [1,10]. */
export function initialDifficulty(
  grade: FsrsGrade,
  w: readonly number[] = FSRS5_DEFAULT_WEIGHTS,
): number {
  return clampDifficulty(w[4] - Math.exp(w[5] * (grade - 1)) + 1);
}

/**
 * Days until the card should next be reviewed, from the forgetting curve:
 *   I(R) = (S / FACTOR) · (R^(1/DECAY) − 1)
 * Rounded to a whole day, minimum 1.
 */
export function nextIntervalDays(
  stability: number,
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
): number {
  const days =
    (stability / FSRS_FACTOR) *
    (Math.pow(requestRetention, 1 / FSRS_DECAY) - 1);
  return Math.max(1, Math.round(days));
}

/** Full initial memory state for a freshly-seeded review card. */
export interface InitialReviewState {
  stability: number;
  difficulty: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export function initialReviewState(
  grade: FsrsGrade,
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
  w: readonly number[] = FSRS5_DEFAULT_WEIGHTS,
): InitialReviewState {
  const stability = initialStability(grade, w);
  return {
    stability,
    difficulty: initialDifficulty(grade, w),
    intervalDays: nextIntervalDays(stability, requestRetention),
    reps: 1,
    lapses: 0,
  };
}

/** `now` + `intervalDays`, as a Date (the value for `review_item.due_at`). */
export function addDays(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two instants (never negative); used for FSRS elapsed time. */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / DAY_MS));
}

/* -------------------------------------------------------------------------- */
/* Review-update step (the card is re-scheduled every time it is graded).      */
/* -------------------------------------------------------------------------- */

/**
 * Retrievability R(t, S): the predicted probability of recall `t` days after a
 * review of a card with stability `S`, from the same forgetting curve used for
 * scheduling. R(S) == 0.9 by the FACTOR definition (interval == stability at
 * R = 0.9).
 */
export function retrievability(elapsedDays: number, stability: number): number {
  const t = Math.max(0, elapsedDays);
  const s = Math.max(MIN_STABILITY, stability);
  return Math.pow(1 + FSRS_FACTOR * (t / s), FSRS_DECAY);
}

/**
 * Next difficulty D'(D, G): apply the linearly-damped delta then mean-revert
 * toward D₀(Easy). Clamped to [1, 10].
 */
export function nextDifficulty(
  difficulty: number,
  grade: FsrsGrade,
  w: readonly number[] = FSRS5_DEFAULT_WEIGHTS,
): number {
  const deltaD = -w[6] * (grade - 3);
  // Linear damping: the closer D is to the ceiling, the smaller the change.
  const damped = difficulty + (deltaD * (10 - difficulty)) / 9;
  const d0Easy = w[4] - Math.exp(w[5] * (4 - 1)) + 1;
  const reverted = w[7] * d0Easy + (1 - w[7]) * damped;
  return clampDifficulty(reverted);
}

/** Post-recall stability S'(D, S, R, G) for a successful review (G ≥ 2). */
function nextRecallStability(
  difficulty: number,
  stability: number,
  r: number,
  grade: FsrsGrade,
  w: readonly number[],
): number {
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  return (
    stability *
    (1 +
      Math.exp(w[8]) *
        (11 - difficulty) *
        Math.pow(stability, -w[9]) *
        (Math.exp((1 - r) * w[10]) - 1) *
        hardPenalty *
        easyBonus)
  );
}

/** Post-lapse stability S'(D, S, R) for a forgotten card (G == 1). */
function nextForgetStability(
  difficulty: number,
  stability: number,
  r: number,
  w: readonly number[],
): number {
  return (
    w[11] *
    Math.pow(difficulty, -w[12]) *
    (Math.pow(stability + 1, w[13]) - 1) *
    Math.exp((1 - r) * w[14])
  );
}

/** Current memory state of a card being reviewed. */
export interface ReviewCardState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
}

/** The recomputed memory state + schedule after grading a due card. */
export interface ReviewUpdate {
  stability: number;
  difficulty: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  /** Retrievability at review time (predicted recall probability). */
  retrievability: number;
  /** Whole days elapsed since the card was last scheduled. */
  elapsedDays: number;
}

/**
 * The FSRS-5 review-update step. Given a card's current memory state, the days
 * elapsed since it was last scheduled, and the grade (1=Again … 4=Easy),
 * recompute stability + difficulty and the next interval. A lapse (Again) uses
 * the post-forget stability and increments `lapses`; a success uses the
 * post-recall stability. Pure and deterministic.
 */
export function reviewUpdate(
  card: ReviewCardState,
  grade: FsrsGrade,
  elapsedDays: number,
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
  w: readonly number[] = FSRS5_DEFAULT_WEIGHTS,
): ReviewUpdate {
  const r = retrievability(elapsedDays, card.stability);
  const difficulty = nextDifficulty(card.difficulty, grade, w);
  const rawStability =
    grade === 1
      ? nextForgetStability(card.difficulty, card.stability, r, w)
      : nextRecallStability(card.difficulty, card.stability, r, grade, w);
  const stability = Math.max(MIN_STABILITY, rawStability);
  return {
    stability,
    difficulty,
    intervalDays: nextIntervalDays(stability, requestRetention),
    reps: card.reps + 1,
    lapses: card.lapses + (grade === 1 ? 1 : 0),
    retrievability: r,
    elapsedDays: Math.max(0, elapsedDays),
  };
}
