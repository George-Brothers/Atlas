/**
 * Seed script — inserts the fixed Tier-1 spine + the authored content library.
 *
 * Offline authoring lane: this is the ONLY place content enters the DB in
 * Phase 1 (no live curriculum/lesson generation). It reads the typed authored
 * data in `lib/content/` and inserts it into topic / topic_prereq / curriculum
 * / module / lesson / content_block / assessment / question, plus a canonical
 * single-user learner shell to own the curriculum.
 *
 * Idempotent: topics/prereqs upsert on their natural keys; the learner,
 * curriculum, module, and lessons are get-or-create (a lesson's natural key is
 * its module + mastery-gate topic). Content blocks and the assessment are
 * backfilled for any lesson that is missing them, and lesson metadata (title,
 * status, est. minutes) is refreshed to the authored version. This means
 * re-running the seed after authoring UPGRADES previously-stub lessons in place
 * — turning a Phase-1 spine (one real lesson, nine stubs) into the full,
 * masterable spine without dropping the database. Safe to re-run.
 *
 * Run (needs DATABASE_URL, e.g. after `npm run db:migrate`):
 *   npm run db:seed        # -> node --experimental-strip-types scripts/seed.ts
 *
 * Does NOT call the AI provider or need a DeepSeek credential.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  topic,
  topicPrereq,
  learner,
  curriculum,
  courseModule,
  lesson,
  contentBlock,
  assessment,
  question,
} from "@/lib/db/schema";
import { SPINE, LESSONS, CURRICULUM } from "@/lib/content";

async function seed() {
  const db = getDb();

  /* 1. Topics (upsert by unique slug). --------------------------------------*/
  await db
    .insert(topic)
    .values(
      SPINE.map((t) => ({
        slug: t.slug,
        title: t.title,
        description: t.description,
      })),
    )
    .onConflictDoNothing({ target: topic.slug });

  // Read back the id for every slug.
  const topicRows = await db
    .select({ id: topic.id, slug: topic.slug })
    .from(topic)
    .where(
      inArray(
        topic.slug,
        SPINE.map((t) => t.slug),
      ),
    );
  const topicIdBySlug = new Map(topicRows.map((r) => [r.slug, r.id]));

  /* 2. Prerequisite edges (upsert; composite PK is the natural key). --------*/
  const prereqRows = SPINE.flatMap((t) =>
    t.prereqSlugs.map((p) => ({
      topicId: topicIdBySlug.get(t.slug)!,
      prereqTopicId: topicIdBySlug.get(p)!,
    })),
  );
  if (prereqRows.length > 0) {
    await db.insert(topicPrereq).values(prereqRows).onConflictDoNothing();
  }

  /* 3. Canonical learner (get-or-create; single-user app). ------------------*/
  const existingLearner = await db
    .select({ id: learner.id })
    .from(learner)
    .limit(1);
  let learnerId: string;
  if (existingLearner.length > 0) {
    learnerId = existingLearner[0].id;
  } else {
    const [row] = await db
      .insert(learner)
      .values({ displayName: null })
      .returning({ id: learner.id });
    learnerId = row.id;
  }

  /* 4. Curriculum (get-or-create by learner). -------------------------------*/
  const existingCurriculum = await db
    .select({ id: curriculum.id })
    .from(curriculum)
    .where(eq(curriculum.learnerId, learnerId));
  let curriculumId: string;
  if (existingCurriculum[0]) {
    curriculumId = existingCurriculum[0].id;
  } else {
    const [curriculumRow] = await db
      .insert(curriculum)
      .values({
        learnerId,
        title: CURRICULUM.title,
        summary: CURRICULUM.summary,
        status: "active",
      })
      .returning({ id: curriculum.id });
    curriculumId = curriculumRow.id;
  }

  /* 5. Module + 6-9. lessons, content blocks, assessments, questions. -------
   * All get-or-create / backfill so re-running upgrades previously-stub
   * lessons in place (the M2 masterable-spine migration). */
  let publishedCount = 0;
  let backfilledBlocks = 0;
  let backfilledAssessments = 0;

  for (const mod of CURRICULUM.modules) {
    const existingModule = await db
      .select({ id: courseModule.id })
      .from(courseModule)
      .where(
        and(
          eq(courseModule.curriculumId, curriculumId),
          eq(courseModule.title, mod.title),
        ),
      );
    let moduleId: string;
    if (existingModule[0]) {
      moduleId = existingModule[0].id;
    } else {
      const [moduleRow] = await db
        .insert(courseModule)
        .values({
          curriculumId,
          title: mod.title,
          orderIndex: mod.orderIndex,
          learningObjectives: mod.objectives,
          status: "active",
        })
        .returning({ id: courseModule.id });
      moduleId = moduleRow.id;
    }

    let lessonOrder = 0;
    for (const topicSlug of mod.lessonTopicSlugs) {
      const authored = LESSONS.find((l) => l.topicSlug === topicSlug);
      if (!authored) continue;

      const gateTopicId = topicIdBySlug.get(topicSlug) ?? null;
      const orderIndex = lessonOrder++;
      const status = authored.status === "published" ? "published" : "stub";
      if (status === "published") publishedCount++;

      // Get-or-create the lesson by (module, mastery-gate topic).
      const existingLesson = gateTopicId
        ? await db
            .select({ id: lesson.id })
            .from(lesson)
            .where(
              and(
                eq(lesson.moduleId, moduleId),
                eq(lesson.masteryGateTopicId, gateTopicId),
              ),
            )
        : [];
      let lessonId: string;
      if (existingLesson[0]) {
        lessonId = existingLesson[0].id;
        // Refresh metadata to the authored version (e.g. stub -> published).
        await db
          .update(lesson)
          .set({
            title: authored.title,
            orderIndex,
            estMinutes: authored.estMinutes ?? null,
            status,
          })
          .where(eq(lesson.id, lessonId));
      } else {
        const [lessonRow] = await db
          .insert(lesson)
          .values({
            moduleId,
            title: authored.title,
            orderIndex,
            estMinutes: authored.estMinutes ?? null,
            status,
            masteryGateTopicId: gateTopicId,
          })
          .returning({ id: lesson.id });
        lessonId = lessonRow.id;
      }

      // Content blocks: backfill only if the lesson has none yet.
      if (authored.blocks && authored.blocks.length > 0) {
        const hasBlocks = await db
          .select({ id: contentBlock.id })
          .from(contentBlock)
          .where(eq(contentBlock.lessonId, lessonId))
          .limit(1);
        if (!hasBlocks[0]) {
          await db.insert(contentBlock).values(
            authored.blocks.map((b, i) => ({
              lessonId,
              orderIndex: i,
              kind: b.kind,
              body: b.body,
            })),
          );
          backfilledBlocks++;
        }
      }

      // Assessment + questions: backfill only if the lesson has none yet.
      if (authored.assessment) {
        const hasAssessment = await db
          .select({ id: assessment.id })
          .from(assessment)
          .where(eq(assessment.lessonId, lessonId))
          .limit(1);
        if (!hasAssessment[0]) {
          const [assessmentRow] = await db
            .insert(assessment)
            .values({
              lessonId,
              kind: authored.assessment.kind,
              title: authored.assessment.title,
              passingScore: String(authored.assessment.passingScore),
            })
            .returning({ id: assessment.id });
          const assessmentId = assessmentRow.id;

          await db.insert(question).values(
            authored.assessment.questions.map((q, i) => ({
              assessmentId,
              orderIndex: i,
              type: q.type,
              prompt: q.prompt,
              choices: q.type === "mcq" ? q.choices : null,
              answerKey: q.answerKey,
              topicId: gateTopicId,
              points: String(q.points ?? 1),
            })),
          );
          backfilledAssessments++;
        }
      }
    }
  }

  console.log(
    `Seeded: ${SPINE.length} topics, ${prereqRows.length} prereq edges, ` +
      `curriculum "${CURRICULUM.title}", ${LESSONS.length} lessons ` +
      `(${publishedCount} published) for learner ${learnerId}. ` +
      `Backfilled blocks for ${backfilledBlocks} lesson(s), ` +
      `assessments for ${backfilledAssessments} lesson(s).`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
