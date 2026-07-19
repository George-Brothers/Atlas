/**
 * Golden-set eval math — PURE scoring/aggregation, no SDK or network.
 *
 * Shared by the deterministic sanity test (`test/ai-routing.test.ts`) and the
 * live harness (`scripts/grader-eval.ts`). Keeping the gate logic here means the
 * pass/fail rule is itself unit-tested and identical in both places.
 */
import type { RubricCriterion } from "@/lib/learning/types";
import type { GraderFixture } from "./fixtures.ts";

/** The subset of a grader result this harness needs (awarded points per id). */
export interface GradedCriterion {
  id: string;
  awarded: number;
}

/** Total possible points for a rubric. */
export function maxPoints(criteria: RubricCriterion[]): number {
  return criteria.reduce((sum, c) => sum + c.points, 0);
}

/** Awarded fraction [0,1] of the rubric's max points. */
export function awardedFraction(
  criteria: RubricCriterion[],
  graded: GradedCriterion[],
): number {
  const max = maxPoints(criteria);
  if (max <= 0) return 0;
  const byId = new Map(graded.map((g) => [g.id, g.awarded]));
  let total = 0;
  for (const c of criteria) {
    const awarded = byId.get(c.id) ?? 0;
    // Mirror the grader's downstream clamp so the eval can't be gamed.
    total += Math.max(0, Math.min(c.points, awarded));
  }
  return total / max;
}

export interface FixtureVerdict {
  id: string;
  category: GraderFixture["category"];
  fraction: number;
  band: [number, number];
  /** Within the expected band (inclusive, small epsilon). */
  withinBand: boolean;
  /**
   * Over the strictness ceiling — awarded more than the band's max. For the
   * non-`correct` categories this is the leniency failure the gate rejects.
   */
  tooLenient: boolean;
  /** Absolute error vs the band midpoint (calibration). */
  absError: number;
}

const EPS = 1e-9;

/** Evaluate one graded fixture against its expected band. */
export function evaluateFixture(
  fixture: GraderFixture,
  graded: GradedCriterion[],
): FixtureVerdict {
  const fraction = awardedFraction(fixture.criteria, graded);
  const [min, max] = fixture.expectedBand;
  const mid = (min + max) / 2;
  return {
    id: fixture.id,
    category: fixture.category,
    fraction,
    band: fixture.expectedBand,
    withinBand: fraction >= min - EPS && fraction <= max + EPS,
    tooLenient: fraction > max + EPS,
    absError: Math.abs(fraction - mid),
  };
}

export interface EvalSummary {
  total: number;
  withinBand: number;
  /** Leniency failures across ALL categories. */
  tooLenient: number;
  /** Leniency failures on the categories that must be denied credit. */
  strictnessFailures: FixtureVerdict[];
  /** Mean absolute calibration error across all fixtures. */
  meanAbsError: number;
  /** True when the model is at least as strict as the golden set requires. */
  passed: boolean;
}

/** Categories where the grader MUST NOT award above the band ceiling. */
export const STRICTNESS_CATEGORIES: ReadonlySet<GraderFixture["category"]> =
  new Set(["vague-trap", "wrong", "offtopic", "empty"]);

/**
 * Aggregate verdicts into the migration gate. The gate is intentionally about
 * STRICTNESS, not niceness: the candidate model passes iff it never over-credits
 * a must-deny fixture (`vague-trap` / `wrong` / `offtopic` / `empty`). Calibration
 * and within-band rates are reported for insight but do not fail the gate on
 * their own, since a *stricter*-than-expected grader is acceptable.
 */
export function summarize(verdicts: FixtureVerdict[]): EvalSummary {
  const strictnessFailures = verdicts.filter(
    (v) => STRICTNESS_CATEGORIES.has(v.category) && v.tooLenient,
  );
  const meanAbsError =
    verdicts.length === 0
      ? 0
      : verdicts.reduce((s, v) => s + v.absError, 0) / verdicts.length;
  return {
    total: verdicts.length,
    withinBand: verdicts.filter((v) => v.withinBand).length,
    tooLenient: verdicts.filter((v) => v.tooLenient).length,
    strictnessFailures,
    meanAbsError,
    passed: strictnessFailures.length === 0,
  };
}
