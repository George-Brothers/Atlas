"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  answer,
  attempt,
  masteryRecord,
  reviewItem,
} from "@/lib/db/schema";
import { getGradingData, getLearner } from "@/lib/db/queries";
import {
  computeMastery,
  foldFreeTextScores,
  gradeMcq,
  type GradedQuestion,
} from "@/lib/learning/mastery";
import { gradeFreeText } from "@/lib/ai/grader";
import { addDays, initialReviewState } from "@/lib/learning/fsrs";
import {
  MASTERY_THRESHOLD,
  type FreeTextAnswerKey,
  type McqAnswerKey,
} from "@/lib/learning/types";

/**
 * Grade a quiz submission and run the mastery gate. This is the heart of the
 * loop:
 *  1. MCQs are graded deterministically (`gradeMcq`).
 *  2. The free-text answer is graded by the STRICT LLM grader (cheap slot),
 *     with the learner's identity stripped from the prompt; its per-criterion
 *     scores are folded deterministically (`foldFreeTextScores`).
 *  3. `computeMastery` aggregates to a score + pass/fail against the threshold.
 *  4. On the gate: upsert `mastery_record`; on a pass, seed FSRS `review_item`
 *     cards (surfaced + re-scheduled by the `/review` loop). Unlocking the next
 *     topic is implicit — the dashboard recomputes availability from mastery.
 *
 * `assessmentId` / `lessonId` are bound by the form; `formData` holds answers.
 */
export async function submitQuiz(
  assessmentId: string,
  lessonId: string,
  formData: FormData,
): Promise<void> {
  const learner = await getLearner();
  if (!learner) redirect("/intake");

  const data = await getGradingData(assessmentId);
  if (!data) redirect(`/lesson/${lessonId}`);

  const db = getDb();
  const learnerId = learner.id;

  const [attemptRow] = await db
    .insert(attempt)
    .values({ learnerId, assessmentId, status: "in_progress" })
    .returning({ id: attempt.id });
  const attemptId = attemptRow.id;

  const graded: GradedQuestion[] = [];
  const answerRows: (typeof answer.$inferInsert)[] = [];

  for (const q of data.questions) {
    const points = q.points == null ? 1 : Number(q.points);
    const raw = formData.get(`q_${q.id}`);

    if (q.type === "mcq") {
      const parsed = raw == null || raw === "" ? null : Number(raw);
      const selectedIndex =
        parsed != null && Number.isFinite(parsed) ? parsed : null;
      const g = gradeMcq(q.answerKey as McqAnswerKey, selectedIndex, points);
      graded.push(g);
      answerRows.push({
        attemptId,
        questionId: q.id,
        response: { selectedIndex },
        score: String(g.earnedPoints),
        isCorrect: g.isCorrect,
        gradedBy: "auto",
      });
    } else {
      const text = String(raw ?? "");
      const key = q.answerKey as FreeTextAnswerKey;
      const result = await gradeFreeText({
        questionPrompt: q.prompt,
        criteria: key.criteria,
        guidance: key.guidance,
        learnerResponse: text,
      });
      const g = foldFreeTextScores(
        key.criteria,
        result.criteria.map((c) => ({ id: c.id, awarded: c.awarded })),
      );
      graded.push(g);
      answerRows.push({
        attemptId,
        questionId: q.id,
        response: { text, criteria: result.criteria },
        score: String(g.earnedPoints),
        isCorrect: g.isCorrect,
        aiFeedback: result.overallFeedback,
        gradedBy: "ai:cheap",
      });
    }
  }

  await db.insert(answer).values(answerRows);

  const threshold =
    data.assessment.passingScore != null
      ? Number(data.assessment.passingScore)
      : MASTERY_THRESHOLD;
  const outcome = computeMastery(graded, threshold);

  await db
    .update(attempt)
    .set({
      submittedAt: new Date(),
      status: "graded",
      totalScore: String(outcome.score),
      passed: outcome.passed,
    })
    .where(eq(attempt.id, attemptId));

  const gateTopicId = data.assessment.gateTopicId;
  if (gateTopicId) {
    const now = new Date();
    await db
      .insert(masteryRecord)
      .values({
        learnerId,
        topicId: gateTopicId,
        masteryScore: String(outcome.score),
        level: outcome.passed ? "2" : "1",
        evidence: { attemptId, source: "quiz" },
        lastAssessedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [masteryRecord.learnerId, masteryRecord.topicId],
        set: {
          masteryScore: String(outcome.score),
          level: outcome.passed ? "2" : "1",
          evidence: { attemptId, source: "quiz" },
          lastAssessedAt: now,
          updatedAt: now,
        },
      });

    if (outcome.passed) {
      // Seed one FSRS review card per quiz question (skip any already seeded);
      // the `/review` loop surfaces and re-schedules them (`submitReview`).
      const existing = await db
        .select({ q: reviewItem.sourceQuestionId })
        .from(reviewItem)
        .where(eq(reviewItem.learnerId, learnerId));
      const have = new Set(existing.map((e) => e.q));
      const st = initialReviewState(3); // "Good" first review
      const due = addDays(now, st.intervalDays);
      const newCards = data.questions
        .filter((q) => !have.has(q.id))
        .map((q) => ({
          learnerId,
          topicId: gateTopicId,
          sourceQuestionId: q.id,
          stability: String(st.stability),
          difficulty: String(st.difficulty),
          reps: st.reps,
          lapses: st.lapses,
          dueAt: due,
        }));
      if (newCards.length > 0) {
        await db.insert(reviewItem).values(newCards);
      }
    }
  }

  redirect(`/lesson/${lessonId}/quiz?graded=${attemptId}`);
}
