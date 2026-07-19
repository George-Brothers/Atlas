/**
 * Unit tests for the deterministic learning-loop logic (run via `npm test` /
 * `node --test`). These cover the parts of the loop that must be correct
 * without a live DB or API key: MCQ grading, mastery aggregation + gate,
 * topic unlock, FSRS-5 scheduling, and placement seeding.
 *
 * Uses `.ts` import specifiers because Node runs these directly via native
 * type-stripping; `test/` is excluded from tsconfig.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeMcq,
  foldFreeTextScores,
  computeMastery,
  computeTopicStatuses,
  nextAvailableTopic,
  type TopicNode,
} from "../lib/learning/mastery.ts";
import {
  FSRS5_DEFAULT_WEIGHTS,
  initialStability,
  initialDifficulty,
  nextIntervalDays,
  initialReviewState,
  addDays,
  daysBetween,
  retrievability,
  nextDifficulty,
  reviewUpdate,
  reviewGradeFromScore,
  type ReviewCardState,
} from "../lib/learning/fsrs.ts";
import { seedMasteryFromPlacement } from "../lib/learning/placement.ts";
import { MASTERY_THRESHOLD } from "../lib/learning/types.ts";

/* ------------------------------ MCQ grading ------------------------------- */

test("gradeMcq awards full points for the correct choice only", () => {
  assert.deepEqual(gradeMcq({ correctIndex: 2 }, 2, 3), {
    points: 3,
    earnedPoints: 3,
    isCorrect: true,
  });
  assert.deepEqual(gradeMcq({ correctIndex: 2 }, 0, 3), {
    points: 3,
    earnedPoints: 0,
    isCorrect: false,
  });
});

test("gradeMcq treats a missing selection as wrong", () => {
  assert.equal(gradeMcq({ correctIndex: 1 }, null).isCorrect, false);
  assert.equal(gradeMcq({ correctIndex: 1 }, undefined).earnedPoints, 0);
});

/* --------------------------- free-text folding ---------------------------- */

const CRITERIA = [
  { id: "mechanism", description: "explains the mechanism", points: 2 },
  { id: "why", description: "explains why it works", points: 2 },
];

test("foldFreeTextScores sums per-criterion scores and caps each criterion", () => {
  const g = foldFreeTextScores(CRITERIA, [
    { id: "mechanism", awarded: 2 },
    { id: "why", awarded: 1 },
  ]);
  assert.equal(g.points, 4);
  assert.equal(g.earnedPoints, 3);
  assert.equal(g.isCorrect, false);
});

test("foldFreeTextScores clamps over-awarded and negative criterion scores", () => {
  const g = foldFreeTextScores(CRITERIA, [
    { id: "mechanism", awarded: 99 }, // capped at 2
    { id: "why", awarded: -5 }, // floored at 0
  ]);
  assert.equal(g.earnedPoints, 2);
});

test("foldFreeTextScores treats a missing criterion score as zero", () => {
  const g = foldFreeTextScores(CRITERIA, [{ id: "mechanism", awarded: 2 }]);
  assert.equal(g.earnedPoints, 2);
  assert.equal(g.isCorrect, false);
});

test("foldFreeTextScores marks full marks as correct", () => {
  const g = foldFreeTextScores(CRITERIA, [
    { id: "mechanism", awarded: 2 },
    { id: "why", awarded: 2 },
  ]);
  assert.equal(g.isCorrect, true);
});

/* --------------------------- mastery + gate ------------------------------- */

test("computeMastery scores percent of points and applies the threshold", () => {
  // 8 of 10 points -> 80% -> passes at threshold 80.
  const out = computeMastery([
    { points: 6, earnedPoints: 6, isCorrect: true },
    { points: 4, earnedPoints: 2, isCorrect: false },
  ]);
  assert.equal(out.score, 80);
  assert.equal(out.passed, true);
  assert.equal(out.earnedPoints, 8);
  assert.equal(out.totalPoints, 10);
});

test("computeMastery fails just below the threshold", () => {
  const out = computeMastery([
    { points: 10, earnedPoints: 7, isCorrect: false },
  ]);
  assert.equal(out.score, 70);
  assert.equal(out.passed, false);
});

test("computeMastery on an empty quiz scores 0 and does not pass", () => {
  const out = computeMastery([]);
  assert.equal(out.score, 0);
  assert.equal(out.passed, false);
});

/* ------------------------- topic gate / unlock ---------------------------- */

const SPINE: TopicNode[] = [
  { slug: "tokens-embeddings", prereqSlugs: [] },
  { slug: "neural-nets-backprop", prereqSlugs: ["tokens-embeddings"] },
  { slug: "language-modeling", prereqSlugs: ["neural-nets-backprop"] },
  { slug: "attention", prereqSlugs: ["language-modeling"] },
];

test("computeTopicStatuses gates topics behind unmet prerequisites", () => {
  const s = computeTopicStatuses(SPINE, new Set());
  assert.equal(s.get("tokens-embeddings"), "available");
  assert.equal(s.get("neural-nets-backprop"), "locked");
  assert.equal(s.get("attention"), "locked");
});

test("computeTopicStatuses unlocks the next topic once prereqs are mastered", () => {
  const s = computeTopicStatuses(SPINE, new Set(["tokens-embeddings"]));
  assert.equal(s.get("tokens-embeddings"), "mastered");
  assert.equal(s.get("neural-nets-backprop"), "available");
  assert.equal(s.get("language-modeling"), "locked");
});

test("nextAvailableTopic returns the first available topic in spine order", () => {
  assert.equal(nextAvailableTopic(SPINE, new Set()), "tokens-embeddings");
  assert.equal(
    nextAvailableTopic(SPINE, new Set(["tokens-embeddings"])),
    "neural-nets-backprop",
  );
});

test("nextAvailableTopic is null when everything reachable is mastered", () => {
  const all = new Set(SPINE.map((t) => t.slug));
  assert.equal(nextAvailableTopic(SPINE, all), null);
});

/* -------------------------------- FSRS-5 ---------------------------------- */

test("initialStability equals w[grade-1]", () => {
  assert.equal(initialStability(3), FSRS5_DEFAULT_WEIGHTS[2]);
  assert.equal(initialStability(1), FSRS5_DEFAULT_WEIGHTS[0]);
});

test("initialDifficulty follows the D0(G) formula", () => {
  const w = FSRS5_DEFAULT_WEIGHTS;
  const expected = w[4] - Math.exp(w[5] * (3 - 1)) + 1;
  assert.ok(Math.abs(initialDifficulty(3) - expected) < 1e-9);
  // All default-weight difficulties stay within the valid [1,10] band.
  for (const g of [1, 2, 3, 4] as const) {
    const d = initialDifficulty(g);
    assert.ok(d >= 1 && d <= 10);
  }
});

test("initialDifficulty clamps out-of-range results to [1,10]", () => {
  // Synthetic weights that would drive D0 far outside the band.
  const hi = [...FSRS5_DEFAULT_WEIGHTS];
  hi[4] = 100; // huge base -> clamps to 10
  assert.equal(initialDifficulty(1, hi), 10);
  const lo = [...FSRS5_DEFAULT_WEIGHTS];
  lo[4] = -100; // hugely negative base -> clamps to 1
  assert.equal(initialDifficulty(1, lo), 1);
});

test("nextIntervalDays equals stability at R=0.9 (by FACTOR definition)", () => {
  // With R=0.9 the interval reduces to the stability itself; S0(Good)=3.173.
  assert.equal(nextIntervalDays(initialStability(3)), 3);
});

test("nextIntervalDays is longer for a lower retention target", () => {
  // Lower retention target => longer interval; higher => shorter.
  const s = 10;
  assert.ok(nextIntervalDays(s, 0.8) > nextIntervalDays(s, 0.95));
});

test("initialReviewState returns a full seedable card", () => {
  const st = initialReviewState(3);
  assert.equal(st.reps, 1);
  assert.equal(st.lapses, 0);
  assert.equal(st.intervalDays, 3);
  assert.ok(st.stability > 0 && st.difficulty >= 1 && st.difficulty <= 10);
});

test("addDays advances the due date by whole days", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(addDays(now, 3).toISOString(), "2026-01-04T00:00:00.000Z");
});

/* ---------------------- FSRS-5 review-update step -------------------------- */

test("daysBetween counts whole days and never goes negative", () => {
  const a = new Date("2026-01-01T00:00:00.000Z");
  const b = new Date("2026-01-04T00:00:00.000Z");
  assert.equal(daysBetween(a, b), 3);
  assert.equal(daysBetween(b, a), 0); // clamped, not negative
  assert.equal(daysBetween(a, a), 0);
});

test("retrievability is 0.9 after exactly `stability` days", () => {
  // By the FACTOR definition R(S) == 0.9; recall decays monotonically with time.
  assert.ok(Math.abs(retrievability(3.173, 3.173) - 0.9) < 1e-9);
  assert.equal(retrievability(0, 3.173), 1); // just reviewed => certain recall
  assert.ok(retrievability(10, 3.173) < retrievability(3, 3.173));
});

const SEED: ReviewCardState = (() => {
  const st = initialReviewState(3);
  return {
    stability: st.stability,
    difficulty: st.difficulty,
    reps: st.reps,
    lapses: st.lapses,
  };
})();

test("reviewUpdate on a successful recall grows stability and bumps reps", () => {
  const upd = reviewUpdate(SEED, 3, 3);
  assert.ok(upd.stability > SEED.stability); // remembering strengthens the memory
  assert.equal(upd.reps, SEED.reps + 1);
  assert.equal(upd.lapses, SEED.lapses); // no lapse on success
  assert.ok(upd.intervalDays >= 1);
  assert.ok(upd.difficulty >= 1 && upd.difficulty <= 10);
});

test("reviewUpdate on a lapse (Again) shrinks stability and counts a lapse", () => {
  const upd = reviewUpdate(SEED, 1, 3);
  assert.ok(upd.stability < SEED.stability); // forgetting weakens the memory
  assert.equal(upd.lapses, SEED.lapses + 1);
  assert.equal(upd.reps, SEED.reps + 1);
});

test("reviewUpdate: Easy schedules further out than Good, Good further than Hard", () => {
  const hard = reviewUpdate(SEED, 2, 3);
  const good = reviewUpdate(SEED, 3, 3);
  const easy = reviewUpdate(SEED, 4, 3);
  assert.ok(easy.stability > good.stability);
  assert.ok(good.stability > hard.stability);
});

test("reviewUpdate: Again raises difficulty, Easy lowers it", () => {
  const again = reviewUpdate(SEED, 1, 3);
  const easy = reviewUpdate(SEED, 4, 3);
  assert.ok(again.difficulty > SEED.difficulty);
  assert.ok(easy.difficulty < SEED.difficulty);
});

test("reviewGradeFromScore maps score fractions to the four grades", () => {
  assert.equal(reviewGradeFromScore(4, 4), 4); // perfect -> Easy
  assert.equal(reviewGradeFromScore(9, 10), 3); // >=80% -> Good
  assert.equal(reviewGradeFromScore(6, 10), 2); // >=50% -> Hard
  assert.equal(reviewGradeFromScore(2, 10), 1); // failed -> Again
  assert.equal(reviewGradeFromScore(0, 0), 1); // empty question -> lapse
});

test("nextDifficulty moves toward the ceiling on Again and eases on Easy", () => {
  const d = 5;
  assert.ok(nextDifficulty(d, 1) > d);
  assert.ok(nextDifficulty(d, 4) < d);
  // Stays clamped inside [1, 10] even from an extreme starting point.
  assert.ok(nextDifficulty(10, 1) <= 10);
  assert.ok(nextDifficulty(1, 4) >= 1);
});

/* ------------------------------ placement --------------------------------- */

test("seedMasteryFromPlacement maps known skills to mastered topics", () => {
  const seeded = seedMasteryFromPlacement(["embeddings", "attention"]);
  assert.deepEqual(
    seeded.map((s) => s.topicSlug).sort(),
    ["attention", "tokens-embeddings"],
  );
  for (const s of seeded) {
    assert.equal(s.score, MASTERY_THRESHOLD);
    assert.equal(s.level, "2");
  }
});

test("seedMasteryFromPlacement ignores unknown skills", () => {
  assert.deepEqual(seedMasteryFromPlacement(["nonsense", "quantum"]), []);
});
