/**
 * Strict free-text grader (the ONE live LLM call in the Phase 1 loop).
 *
 * Runs on the provider's "cheap" model slot via `lib/ai` — a cheap, fast
 * DeepSeek model (`deepseek-v4-flash`) called directly on DeepSeek's API, not
 * Claude. It is a deliberately separate, adversarial persona from any
 * teaching/encouraging voice:
 *
 *  - ANTI-SYCOPHANCY SEPARATION (load-bearing): the grader is NEVER told who the
 *    learner is, their streak, their history, or any encouragement framing. Its
 *    only inputs are the question, the rubric, and the raw answer text (the
 *    `GradeFreeTextInput` contract lives in `./grader-prompt`). This keeps
 *    grading from drifting lenient to be "nice" to a known learner, and it must
 *    survive any provider swap — see the golden-set eval below.
 *  - Per-criterion scoring against an explicit rubric, with quoted evidence and
 *    an explicit anti-leniency instruction.
 *  - Structured output (validated by zod via `generateObject`) so the caller
 *    gets machine-usable per-criterion scores, not prose to parse.
 *
 * The cheaper DeepSeek model must grade AS STRICTLY as Claude did; the
 * golden-set grader eval (`scripts/grader-eval.ts`, `npm run eval:grader`) is
 * the regression gate for that.
 *
 * Combining these scores into a mastery score / pass decision happens
 * deterministically in `lib/learning/mastery.ts`, not here.
 */
import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./index";
import {
  GRADER_SYSTEM,
  buildGraderUserPrompt,
  type GradeFreeTextInput,
} from "./grader-prompt";

export type { GradeFreeTextInput };

/** One criterion's graded result. */
export interface CriterionGrade {
  id: string;
  awarded: number;
  maxPoints: number;
  /** A short verbatim quote from the answer justifying the score (or ""). */
  evidence: string;
  justification: string;
}

export interface GradeFreeTextResult {
  criteria: CriterionGrade[];
  overallFeedback: string;
}

/**
 * Grade one free-text answer. Requires a DeepSeek credential at runtime
 * (`getModel` throws without `DEEPSEEK_API_KEY`).
 * Deterministic scoring/pass logic lives in `lib/learning/mastery.ts`.
 */
export async function gradeFreeText(
  input: GradeFreeTextInput,
): Promise<GradeFreeTextResult> {
  const { criteria } = input;

  // Schema mirrors the rubric; awarded is bounded per criterion in the prompt
  // and re-clamped downstream so a misbehaving model can never over-credit.
  const schema = z.object({
    criteria: z.array(
      z.object({
        id: z.string().describe("The criterion id, copied exactly."),
        awarded: z
          .number()
          .describe("Points awarded, between 0 and the criterion's maxPoints."),
        evidence: z
          .string()
          .describe("A short verbatim quote from the answer, or empty string."),
        justification: z
          .string()
          .describe("One or two sentences on why this score."),
      }),
    ),
    overallFeedback: z
      .string()
      .describe("2-4 sentences of concise, content-only feedback."),
  });

  const { object } = await generateObject({
    model: getModel("cheap"),
    schema,
    system: GRADER_SYSTEM,
    prompt: buildGraderUserPrompt(input),
  });

  const maxById = new Map(criteria.map((c) => [c.id, c.points]));
  return {
    criteria: object.criteria.map((c) => {
      const maxPoints = maxById.get(c.id) ?? 0;
      return {
        id: c.id,
        // Defense in depth: clamp regardless of what the model returned.
        awarded: Math.max(0, Math.min(maxPoints, c.awarded)),
        maxPoints,
        evidence: c.evidence,
        justification: c.justification,
      };
    }),
    overallFeedback: object.overallFeedback,
  };
}
