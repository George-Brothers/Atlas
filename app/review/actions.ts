"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reviewItem, reviewLog } from "@/lib/db/schema";
import { getLearner, getReviewGradingData } from "@/lib/db/queries";
import {
  foldFreeTextScores,
  gradeMcq,
  type GradedQuestion,
} from "@/lib/learning/mastery";
import { gradeFreeText } from "@/lib/ai/grader";
import {
  addDays,
  daysBetween,
  nextIntervalDays,
  reviewGradeFromScore,
  reviewUpdate,
} from "@/lib/learning/fsrs";
import type { FreeTextAnswerKey, McqAnswerKey } from "@/lib/learning/types";

/**
 * Grade one due review card and re-schedule it (the FSRS review-update step).
 * This closes the spaced-repetition loop that seeding alone left open:
 *  1. Grade the answer with the SAME machinery as the quiz — `gradeMcq` for
 *     MCQs, the strict identity-blind grader for free-text. No learner identity
 *     is ever passed to the grader (anti-sycophancy separation preserved).
 *  2. Derive an FSRS grade from the score and run `reviewUpdate` to recompute
 *     stability / difficulty and the next interval.
 *  3. Persist the updated `review_item` and append a `review_log` row.
 *
 * `reviewItemId` is bound by the form; `formData` holds the single answer.
 */
export async function submitReview(
  reviewItemId: string,
  formData: FormData,
): Promise<void> {
  const learner = await getLearner();
  if (!learner) redirect("/intake");

  const data = await getReviewGradingData(reviewItemId, learner.id);
  // Missing / not-owned / already-rescheduled cards just bounce back to /review.
  if (!data) redirect("/review");

  const { item, question: q } = data;
  const points = q.points == null ? 1 : Number(q.points);
  const raw = formData.get(`q_${q.id}`);

  let graded: GradedQuestion;
  if (q.type === "mcq") {
    const parsed = raw == null || raw === "" ? null : Number(raw);
    const selectedIndex =
      parsed != null && Number.isFinite(parsed) ? parsed : null;
    graded = gradeMcq(q.answerKey as McqAnswerKey, selectedIndex, points);
  } else {
    const text = String(raw ?? "");
    const key = q.answerKey as FreeTextAnswerKey;
    const result = await gradeFreeText({
      questionPrompt: q.prompt,
      criteria: key.criteria,
      guidance: key.guidance,
      learnerResponse: text,
    });
    graded = foldFreeTextScores(
      key.criteria,
      result.criteria.map((c) => ({ id: c.id, awarded: c.awarded })),
    );
  }

  const grade = reviewGradeFromScore(graded.earnedPoints, graded.points);

  // Elapsed days since the card was last scheduled. For a card that has never
  // been reviewed, `lastReviewedAt` is null, so fall back to its seeding time —
  // recovered as `dueAt` minus the interval its current stability implies (the
  // stability is unchanged since seeding, so this reconstructs the seed date).
  const now = new Date();
  const scheduledAt =
    item.lastReviewedAt ??
    (item.dueAt ? addDays(item.dueAt, -nextIntervalDays(item.stability)) : now);
  const elapsedDays = daysBetween(scheduledAt, now);

  const upd = reviewUpdate(
    {
      stability: item.stability,
      difficulty: item.difficulty,
      reps: item.reps,
      lapses: item.lapses,
    },
    grade,
    elapsedDays,
  );

  const db = getDb();
  const dueAt = addDays(now, upd.intervalDays);

  await db
    .update(reviewItem)
    .set({
      stability: String(upd.stability),
      difficulty: String(upd.difficulty),
      reps: upd.reps,
      lapses: upd.lapses,
      dueAt,
      lastReviewedAt: now,
      lastGrade: grade,
    })
    .where(eq(reviewItem.id, item.id));

  await db.insert(reviewLog).values({
    reviewItemId: item.id,
    grade,
    scheduledInterval: upd.intervalDays,
    elapsedDays: upd.elapsedDays,
  });

  redirect(`/review?graded=${item.id}`);
}
