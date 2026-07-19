"use server";

import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  learner,
  intakeResponse,
  masteryRecord,
  topic,
} from "@/lib/db/schema";
import { getLearner } from "@/lib/db/queries";
import {
  PLACEMENT_SKILLS,
  seedMasteryFromPlacement,
} from "@/lib/learning/placement";

/** Confidence domains the intake asks a 1–5 self-rating for. */
const CONFIDENCE_DOMAINS = ["math", "programming", "ml_basics", "llms"] as const;

/**
 * Persist the intake questionnaire, then seed initial mastery from the
 * placement answers (skip-if-known) and return to the dashboard.
 *
 * Get-or-create on the single learner: reuses the seeded canonical learner (the
 * one that owns the curriculum) if present, else creates a bare learner.
 */
export async function submitIntake(formData: FormData): Promise<void> {
  const db = getDb();

  const canExplain = PLACEMENT_SKILLS.filter(
    (s) => formData.get(`can_${s}`) === "on",
  );
  const goal = String(formData.get("goal") ?? "").slice(0, 2000);
  const weeklyHours = Number(formData.get("weeklyHours")) || null;
  const sessionMinutes = Number(formData.get("sessionMinutes")) || null;

  const confidence: Record<string, number> = {};
  for (const d of CONFIDENCE_DOMAINS) {
    const v = Number(formData.get(`confidence_${d}`));
    if (Number.isFinite(v) && v >= 1 && v <= 5) confidence[d] = v;
  }

  // 1. Get-or-create the learner.
  let learnerRow = await getLearner();
  if (!learnerRow) {
    const [created] = await db
      .insert(learner)
      .values({ displayName: null })
      .returning();
    learnerRow = created;
  }
  const learnerId = learnerRow.id;

  // 2. Update the learner profile.
  await db
    .update(learner)
    .set({
      goals: { nearTermGoal: goal },
      background: { canExplain, confidence },
      preferences: { weeklyHours, sessionMinutes },
    })
    .where(eq(learner.id, learnerId));

  // 3. Record intake responses (replace any prior run for this learner).
  await db
    .delete(intakeResponse)
    .where(eq(intakeResponse.learnerId, learnerId));
  const responses = [
    { questionKey: "placement_can_explain", answer: canExplain.join(",") },
    { questionKey: "near_term_goal", answer: goal },
    { questionKey: "weekly_hours", answer: String(weeklyHours ?? "") },
    { questionKey: "session_minutes", answer: String(sessionMinutes ?? "") },
    ...CONFIDENCE_DOMAINS.map((d) => ({
      questionKey: `confidence_${d}`,
      answer: String(confidence[d] ?? ""),
    })),
  ];
  await db
    .insert(intakeResponse)
    .values(responses.map((r) => ({ ...r, learnerId })));

  // 4. Seed initial mastery from placement (skip-if-known).
  const seeded = seedMasteryFromPlacement(canExplain);
  if (seeded.length > 0) {
    const slugs = seeded.map((s) => s.topicSlug);
    const topicRows = await db
      .select({ id: topic.id, slug: topic.slug })
      .from(topic)
      .where(inArray(topic.slug, slugs));
    const idBySlug = new Map(topicRows.map((r) => [r.slug, r.id]));
    const now = new Date();
    for (const s of seeded) {
      const topicId = idBySlug.get(s.topicSlug);
      if (!topicId) continue;
      await db
        .insert(masteryRecord)
        .values({
          learnerId,
          topicId,
          masteryScore: String(s.score),
          level: s.level,
          evidence: { source: "placement" },
          lastAssessedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [masteryRecord.learnerId, masteryRecord.topicId],
          set: {
            masteryScore: String(s.score),
            level: s.level,
            evidence: { source: "placement" },
            lastAssessedAt: now,
            updatedAt: now,
          },
        });
    }
  }

  redirect("/");
}
