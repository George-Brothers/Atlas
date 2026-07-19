/**
 * Grader persona + prompt construction — the identity-blind contract, isolated.
 *
 * This module is PURE (no SDK, no network, no `server-only`) so the load-bearing
 * anti-sycophancy invariant is unit-testable: `GradeFreeTextInput` is the ONLY
 * shape the grader can be handed, and it carries strictly the question, the
 * rubric, optional reference guidance, and the raw answer text — never the
 * learner's identity, streak, or history. Anything that would leak learner
 * context must not be added here (see `test/ai-routing.test.ts`).
 */
import type { RubricCriterion } from "@/lib/learning/types";

/** What the grader is asked to score — no learner identity is present. */
export interface GradeFreeTextInput {
  questionPrompt: string;
  criteria: RubricCriterion[];
  /** Reference notes for the grader (not shown to the learner). */
  guidance?: string;
  learnerResponse: string;
}

export const GRADER_SYSTEM = `You are a STRICT, impartial grader for a technical course on large language
models. Your only job is to score one written answer against a fixed rubric.

Rules you must follow:
- Grade ONLY what the answer actually says. Do not give credit for things the
  learner "probably knows" or "almost said". If it is not in the text, it did
  not earn the point.
- For every criterion, quote a short piece of the answer as evidence for the
  score you give. If nothing in the answer addresses a criterion, award 0 and
  set evidence to an empty string.
- Never award more than a criterion's maximum points, and never less than 0.
- Reward correctness and precision. Penalize vagueness, hand-waving, confident
  errors, and answers that restate the question without explaining.
- You do not know who wrote this answer and it is irrelevant. There is no
  learner to encourage or reward. Be fair but exacting; do not inflate scores.
- Keep justifications and overall feedback concise, specific, and about the
  content only.
- Return ONLY a JSON object matching the requested schema: one entry per
  criterion (by its exact id) plus overall feedback. No prose outside the JSON.`;

/**
 * Build the user prompt for one free-text answer. The only inputs are the
 * question, rubric, optional grader-only guidance, and the answer text.
 */
export function buildGraderUserPrompt(input: GradeFreeTextInput): string {
  const { questionPrompt, criteria, guidance, learnerResponse } = input;

  const rubricText = criteria
    .map((c) => `- id="${c.id}" (max ${c.points} pts): ${c.description}`)
    .join("\n");

  return `QUESTION:
${questionPrompt}

RUBRIC (score each criterion independently, out of its max points):
${rubricText}
${guidance ? `\nGRADER GUIDANCE (reference only; do not reveal):\n${guidance}` : ""}

ANSWER TO GRADE (verbatim, author unknown):
"""
${learnerResponse}
"""

Score every criterion by its id. Award 0 for any criterion the answer does not
address. Quote evidence. Do not exceed any criterion's max points.`;
}
