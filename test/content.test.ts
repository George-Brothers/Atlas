/**
 * Content-validation tests for the authored spine (run via `npm test` /
 * `node --test`). These guarantee the M2 invariant: EVERY spine topic is a
 * masterable, fully-authored lesson — content blocks plus a gradeable
 * assessment — so no topic is a dead end.
 *
 * Like `learning.test.ts`, these run under Node's native type-stripping with no
 * DB or API key. The lesson modules' only import is an erased `import type`, so
 * they load as plain data here; we import them directly with `.ts` specifiers
 * (mirroring the lib/learning test convention) rather than through the `@/`
 * alias, which the raw test runner cannot resolve.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPINE } from "../lib/content/spine.ts";
import { tokensEmbeddingsLesson } from "../lib/content/lessons/tokens-embeddings.ts";
import { neuralNetsBackpropLesson } from "../lib/content/lessons/neural-nets-backprop.ts";
import { languageModelingLesson } from "../lib/content/lessons/language-modeling.ts";
import { trainingDynamicsLesson } from "../lib/content/lessons/training-dynamics.ts";
import { attentionLesson } from "../lib/content/lessons/attention.ts";
import { transformersGptLesson } from "../lib/content/lessons/transformers-gpt.ts";
import { trainingVsInferenceLesson } from "../lib/content/lessons/training-vs-inference.ts";
import { lifecyclePretrainSftPreferenceLesson } from "../lib/content/lessons/lifecycle-pretrain-sft-preference.ts";
import { evaluationLesson } from "../lib/content/lessons/evaluation.ts";
import { ragLesson } from "../lib/content/lessons/rag.ts";

/** Every authored lesson, keyed by the topic it gates (mirrors lib/content). */
const LESSONS = [
  tokensEmbeddingsLesson,
  neuralNetsBackpropLesson,
  languageModelingLesson,
  trainingDynamicsLesson,
  attentionLesson,
  transformersGptLesson,
  trainingVsInferenceLesson,
  lifecyclePretrainSftPreferenceLesson,
  evaluationLesson,
  ragLesson,
];

const LESSON_BY_SLUG = new Map(LESSONS.map((l) => [l.topicSlug, l]));

const VALID_BLOCK_KINDS = new Set([
  "prose",
  "mermaid",
  "worked_example",
  "recall_check",
  "applied_task",
  "citation",
]);

/* --------------------------- spine coverage ------------------------------- */

test("every spine topic has exactly one authored lesson (no dead ends)", () => {
  for (const topic of SPINE) {
    const lesson = LESSON_BY_SLUG.get(topic.slug);
    assert.ok(
      lesson,
      `spine topic "${topic.slug}" has no authored lesson — it would be an unmasterable dead end`,
    );
  }
  // And no authored lesson points at a slug that isn't in the spine.
  for (const lesson of LESSONS) {
    assert.ok(
      SPINE.some((t) => t.slug === lesson.topicSlug),
      `authored lesson gates unknown topic "${lesson.topicSlug}"`,
    );
  }
  // One lesson per topic; no duplicate gates.
  assert.equal(LESSON_BY_SLUG.size, LESSONS.length, "duplicate topicSlug across lessons");
  assert.equal(LESSONS.length, SPINE.length, "lesson count must match spine size");
});

/* ---------------------- per-lesson structural checks ---------------------- */

for (const topic of SPINE) {
  const lesson = LESSON_BY_SLUG.get(topic.slug)!;

  test(`[${topic.slug}] is published with real objectives and content blocks`, () => {
    assert.equal(lesson.status, "published", "lesson must be published, not a stub");
    assert.ok(
      Array.isArray(lesson.objectives) && lesson.objectives.length >= 3,
      "lesson needs at least 3 objectives",
    );
    assert.ok(
      Array.isArray(lesson.blocks) && lesson.blocks.length >= 6,
      "a full lesson needs a substantive set of content blocks",
    );

    // Every block has a valid kind and a non-empty body payload.
    for (const [i, block] of lesson.blocks!.entries()) {
      assert.ok(
        VALID_BLOCK_KINDS.has(block.kind),
        `block ${i} has invalid kind "${block.kind}"`,
      );
      assert.ok(block.body && typeof block.body === "object", `block ${i} has no body`);
    }

    // A good lesson mixes modalities: at least one diagram, one worked example,
    // and one citation — matching the showcase's pedagogical shape.
    const kinds = new Set(lesson.blocks!.map((b) => b.kind));
    for (const required of ["prose", "mermaid", "worked_example", "citation"]) {
      assert.ok(kinds.has(required), `lesson should include a "${required}" block`);
    }
  });

  test(`[${topic.slug}] block bodies carry their required fields`, () => {
    for (const [i, block] of lesson.blocks!.entries()) {
      const body = block.body as Record<string, unknown>;
      const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
      switch (block.kind) {
        case "prose":
          assert.ok(nonEmpty(body.markdown), `prose block ${i} needs markdown`);
          break;
        case "mermaid":
          assert.ok(nonEmpty(body.diagram), `mermaid block ${i} needs a diagram`);
          break;
        case "worked_example":
        case "applied_task":
          assert.ok(nonEmpty(body.title), `block ${i} needs a title`);
          assert.ok(nonEmpty(body.markdown), `block ${i} needs markdown`);
          break;
        case "recall_check":
          assert.ok(nonEmpty(body.prompt), `recall_check ${i} needs a prompt`);
          assert.ok(
            body.format === "mcq" || body.format === "free_text",
            `recall_check ${i} needs a valid format`,
          );
          if (body.format === "mcq") {
            assert.ok(
              Array.isArray(body.choices) && body.choices.length >= 2,
              `mcq recall_check ${i} needs choices`,
            );
            assert.ok(
              typeof body.answerIndex === "number" &&
                body.answerIndex >= 0 &&
                body.answerIndex < (body.choices as unknown[]).length,
              `mcq recall_check ${i} needs a valid answerIndex`,
            );
          }
          break;
        case "citation":
          assert.ok(nonEmpty(body.label), `citation ${i} needs a label`);
          assert.ok(
            nonEmpty(body.url) && /^https?:\/\//.test(body.url as string),
            `citation ${i} needs a valid http(s) url`,
          );
          break;
      }
    }
  });

  test(`[${topic.slug}] has a gradeable mastery assessment (>=1 MCQ + >=1 free-text)`, () => {
    const a = lesson.assessment;
    assert.ok(a, "lesson must have an assessment or the quiz 404s and the topic can't be mastered");
    assert.equal(a!.kind, "quiz");
    assert.ok(typeof a!.title === "string" && a!.title.length > 0, "assessment needs a title");
    assert.equal(a!.passingScore, 80, "passing score should mirror the mastery threshold (80)");

    const questions = a!.questions;
    assert.ok(Array.isArray(questions) && questions.length >= 2, "assessment needs multiple questions");

    const mcqs = questions.filter((q) => q.type === "mcq");
    const frees = questions.filter((q) => q.type === "free_text");
    assert.ok(mcqs.length >= 1, "assessment needs at least one MCQ");
    assert.ok(frees.length >= 1, "assessment needs at least one free-text question");
  });

  test(`[${topic.slug}] every question has a valid, gradeable answer key`, () => {
    for (const [i, q] of lesson.assessment!.questions.entries()) {
      assert.ok(typeof q.prompt === "string" && q.prompt.trim().length > 0, `question ${i} needs a prompt`);
      if (q.type === "mcq") {
        assert.ok(Array.isArray(q.choices) && q.choices.length >= 2, `mcq ${i} needs >=2 choices`);
        const idx = q.answerKey.correctIndex;
        assert.ok(
          typeof idx === "number" && idx >= 0 && idx < q.choices.length,
          `mcq ${i} correctIndex out of range`,
        );
      } else {
        const criteria = q.answerKey.criteria;
        assert.ok(Array.isArray(criteria) && criteria.length >= 1, `free-text ${i} needs rubric criteria`);
        const ids = new Set<string>();
        let sum = 0;
        for (const c of criteria) {
          assert.ok(typeof c.id === "string" && c.id.length > 0, `free-text ${i} criterion needs an id`);
          assert.ok(!ids.has(c.id), `free-text ${i} has duplicate criterion id "${c.id}"`);
          ids.add(c.id);
          assert.ok(
            typeof c.description === "string" && c.description.trim().length > 0,
            `free-text ${i} criterion "${c.id}" needs a description`,
          );
          assert.ok(typeof c.points === "number" && c.points > 0, `free-text ${i} criterion "${c.id}" needs positive points`);
          sum += c.points;
        }
        // Rubric points must add up to the question's points, or grading math
        // (foldFreeTextScores) can never award full marks.
        if (typeof q.points === "number") {
          assert.equal(sum, q.points, `free-text ${i} criteria points (${sum}) must sum to question points (${q.points})`);
        }
      }
    }
  });
}
