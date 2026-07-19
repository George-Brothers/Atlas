/**
 * The full authored content set the seed inserts.
 *
 * One curriculum ("Foundations of Modern LLMs") with a single module holding the
 * Tier-1 spine, in DAG order. Every spine topic is authored in full — content
 * blocks + a mastery assessment — so the entire spine is masterable end to end.
 * `tokens-embeddings` is the reference showcase; the other lessons match its
 * structure, depth, and four-question framing.
 */
import type {
  AuthoredCurriculum,
  AuthoredLesson,
} from "./types";
import { SPINE } from "./spine";
import { tokensEmbeddingsLesson } from "./lessons/tokens-embeddings";
import { neuralNetsBackpropLesson } from "./lessons/neural-nets-backprop";
import { languageModelingLesson } from "./lessons/language-modeling";
import { trainingDynamicsLesson } from "./lessons/training-dynamics";
import { attentionLesson } from "./lessons/attention";
import { transformersGptLesson } from "./lessons/transformers-gpt";
import { trainingVsInferenceLesson } from "./lessons/training-vs-inference";
import { lifecyclePretrainSftPreferenceLesson } from "./lessons/lifecycle-pretrain-sft-preference";
import { evaluationLesson } from "./lessons/evaluation";
import { ragLesson } from "./lessons/rag";

/** Every authored lesson, keyed by the spine topic it gates. */
const AUTHORED_LESSONS: AuthoredLesson[] = [
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

const LESSON_BY_SLUG = new Map(
  AUTHORED_LESSONS.map((l) => [l.topicSlug, l]),
);

/**
 * All lessons, in spine (DAG) order. Every spine topic must have a full lesson;
 * a missing one is an authoring bug and fails the seed loudly rather than
 * silently shipping a dead-end topic.
 */
export const LESSONS: AuthoredLesson[] = SPINE.map((topic) => {
  const lesson = LESSON_BY_SLUG.get(topic.slug);
  if (!lesson) {
    throw new Error(
      `No authored lesson for spine topic "${topic.slug}" — every spine topic must be authored in full.`,
    );
  }
  return lesson;
});

/** The single curriculum + module wrapper for the spine. */
export const CURRICULUM: AuthoredCurriculum = {
  title: "Foundations of Modern LLMs",
  summary:
    "A Tier-1 spine from tokens & embeddings through the Transformer, training, and the assistant lifecycle. Built as a prerequisite DAG: each topic unlocks once its prerequisites are mastered.",
  modules: [
    {
      title: "Tier-1 spine",
      orderIndex: 0,
      objectives: [
        "Build a mechanistic, end-to-end mental model of how modern LLMs work.",
        "Master each foundational topic to depth 2 before advancing.",
      ],
      lessonTopicSlugs: SPINE.map((t) => t.slug),
    },
  ],
};

export { SPINE } from "./spine";
export { tokensEmbeddingsLesson } from "./lessons/tokens-embeddings";
