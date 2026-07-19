/**
 * Authoring types for seed content.
 *
 * These are the shapes the offline authoring lane (hand-written lesson content
 * + the fixed topic spine) is written against, and what `scripts/seed.ts`
 * inserts into `topic` / `curriculum` / `module` / `lesson` / `content_block` /
 * `assessment` / `question`. Keeping the authored data typed means the seed is
 * schema-checked at build time — no live DB needed to catch a bad payload.
 *
 * `content_block.body` and `question.answer_key` are stored as jsonb; the union
 * types below are the contract the lesson viewer and grader read back.
 */
import type {
  FreeTextAnswerKey,
  McqAnswerKey,
} from "@/lib/learning/types";

/* ------------------------------- topics ---------------------------------- */

/** One Tier-1 topic in the fixed authored spine. */
export interface AuthoredTopic {
  slug: string;
  title: string;
  description: string;
  /** Target mastery depth (1=recall … 4=create). Phase 1 authors depth ≤ 2. */
  targetDepth: number;
  /** Slugs of topics that must be mastered first. */
  prereqSlugs: string[];
}

/* --------------------------- content blocks ------------------------------- */

export type ContentBlockKind =
  | "prose"
  | "mermaid"
  | "worked_example"
  | "recall_check"
  | "applied_task"
  | "citation";

/** Long-form textbook prose, rendered as GitHub-flavoured markdown. */
export interface ProseBody {
  heading?: string;
  markdown: string;
}

/** A Mermaid diagram, rendered client-side in the lesson viewer. */
export interface MermaidBody {
  title?: string;
  /** Mermaid source (e.g. a `flowchart LR ...`). */
  diagram: string;
  caption?: string;
}

/** A worked example: markdown with tables / code showing a computation. */
export interface WorkedExampleBody {
  title: string;
  markdown: string;
}

/** An inline recall check embedded in the lesson body (not the graded quiz). */
export interface RecallCheckBody {
  format: "free_text" | "mcq";
  prompt: string;
  /** free_text: the self-check rubric shown after the learner answers. */
  rubric?: string;
  /** mcq: the choices. */
  choices?: string[];
  /** mcq: index of the correct choice, revealed on demand. */
  answerIndex?: number;
  /** Explanation revealed after answering. */
  explanation?: string;
}

/** A hands-on applied task at the end of a lesson. */
export interface AppliedTaskBody {
  title: string;
  markdown: string;
}

/** A source citation block. */
export interface CitationBody {
  label: string;
  url: string;
  author?: string;
  note?: string;
}

export type ContentBlockBody =
  | ProseBody
  | MermaidBody
  | WorkedExampleBody
  | RecallCheckBody
  | AppliedTaskBody
  | CitationBody;

/** A single authored content block (order is its position in the array). */
export type AuthoredBlock =
  | { kind: "prose"; body: ProseBody }
  | { kind: "mermaid"; body: MermaidBody }
  | { kind: "worked_example"; body: WorkedExampleBody }
  | { kind: "recall_check"; body: RecallCheckBody }
  | { kind: "applied_task"; body: AppliedTaskBody }
  | { kind: "citation"; body: CitationBody };

/* ------------------------------- quiz ------------------------------------- */

export interface AuthoredMcq {
  type: "mcq";
  prompt: string;
  choices: string[];
  answerKey: McqAnswerKey;
  points?: number;
}

export interface AuthoredFreeText {
  type: "free_text";
  prompt: string;
  answerKey: FreeTextAnswerKey;
  points?: number;
}

export type AuthoredQuestion = AuthoredMcq | AuthoredFreeText;

export interface AuthoredAssessment {
  /** `assessment.kind`, e.g. "quiz". */
  kind: string;
  title: string;
  /** Percent needed to pass (mirrors the mastery threshold). */
  passingScore: number;
  questions: AuthoredQuestion[];
}

/* ------------------------------ lessons ----------------------------------- */

/**
 * A lesson, gated by exactly one topic. `published` lessons carry full content
 * blocks + a quiz; `stub` lessons carry only a title + objectives so the DAG
 * and dashboard are real while the rest of the spine is authored later.
 */
export interface AuthoredLesson {
  /** The topic whose mastery this lesson gates (`lesson.mastery_gate_topic_id`). */
  topicSlug: string;
  title: string;
  estMinutes?: number;
  status: "published" | "stub";
  objectives: string[];
  blocks?: AuthoredBlock[];
  assessment?: AuthoredAssessment;
}

/* --------------------------- curriculum ----------------------------------- */

export interface AuthoredModule {
  title: string;
  orderIndex: number;
  objectives: string[];
  /** Topic slugs whose lessons belong to this module, in order. */
  lessonTopicSlugs: string[];
}

export interface AuthoredCurriculum {
  title: string;
  summary: string;
  modules: AuthoredModule[];
}
