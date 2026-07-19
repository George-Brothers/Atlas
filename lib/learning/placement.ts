/**
 * Placement → initial mastery seeding.
 *
 * Phase 1 keeps this a simple skip-if-known mapping: the five placement skills
 * the intake asks about map to topic slugs, and anything the learner says they
 * can already explain is seeded as mastered so the dashboard unlocks past it.
 * Confidence ratings are persisted (intake_response) for later use but do not
 * feed the mastery seed yet — kept deliberately simple per the Phase 1 plan.
 */
import { MASTERY_THRESHOLD, type MasteryLevel } from "./types.ts";

/** Placement skills the intake asks "can you already explain this?" about. */
export const PLACEMENT_SKILLS = [
  "attention",
  "embeddings",
  "fine-tuning",
  "rag",
  "eval",
] as const;

export type PlacementSkill = (typeof PLACEMENT_SKILLS)[number];

/** Which topic slug each placement skill certifies when "can explain". */
export const PLACEMENT_SKILL_TO_TOPIC: Record<PlacementSkill, string> = {
  attention: "attention",
  embeddings: "tokens-embeddings",
  "fine-tuning": "lifecycle-pretrain-sft-preference",
  rag: "rag",
  eval: "evaluation",
};

/** A mastery row to seed from placement. */
export interface SeededMastery {
  topicSlug: string;
  score: number;
  level: MasteryLevel;
}

/**
 * Seed mastery from the placement answers. Each skill the learner claims to be
 * able to explain marks its topic mastered at the pass threshold, level 2
 * ("mechanistic intuition"). Unknown skills are ignored (learner starts locked
 * behind prerequisites as usual).
 */
export function seedMasteryFromPlacement(
  canExplain: readonly string[],
): SeededMastery[] {
  const seeded: SeededMastery[] = [];
  for (const skill of canExplain) {
    const topicSlug =
      PLACEMENT_SKILL_TO_TOPIC[skill as PlacementSkill] ?? undefined;
    if (!topicSlug) continue;
    seeded.push({ topicSlug, score: MASTERY_THRESHOLD, level: "2" });
  }
  return seeded;
}
