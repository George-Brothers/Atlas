/**
 * Golden-set grader fixtures — the strictness safeguard for the M1 migration.
 *
 * Each fixture pairs a real question + rubric with an answer whose quality is
 * KNOWN and human-labelled, and records the score band (as a fraction of the
 * rubric's max points) a correct, strict grader should land in. The live
 * harness (`scripts/grader-eval.ts`) runs a candidate grader model through the
 * real `gradeFreeText` and asserts it grades at least as strictly as these
 * bands — the acceptance gate for swapping the cheap slot off Claude.
 *
 * PURE data only (no SDK/network) so it is safe under `node --test` and shared
 * by both the deterministic sanity test and the live eval.
 *
 * The category spectrum is deliberate:
 *   - correct    : precise, complete → should score high
 *   - partial    : some criteria met, others missing → mid band
 *   - vague-trap : plausible-sounding but content-free → THE leniency trap; a
 *                  weak model over-credits these. Must be denied credit.
 *   - wrong      : confident but incorrect → near zero
 *   - offtopic   : unrelated to the question → near zero
 *   - empty      : blank / non-answer → exactly zero
 */
import type { RubricCriterion } from "@/lib/learning/types";

export type FixtureCategory =
  | "correct"
  | "partial"
  | "vague-trap"
  | "wrong"
  | "offtopic"
  | "empty";

export interface GraderFixture {
  id: string;
  category: FixtureCategory;
  questionPrompt: string;
  criteria: RubricCriterion[];
  guidance?: string;
  learnerResponse: string;
  /**
   * Acceptable score as a fraction of total rubric points, [min, max].
   * For non-`correct` categories `max` is the strictness ceiling: the grader
   * must NOT award above it.
   */
  expectedBand: [number, number];
}

// ── Question A: tokenization ────────────────────────────────────────────────
const Q_TOKENIZATION = {
  questionPrompt:
    "Explain what a token is in a large language model, and why models operate " +
    "on subword tokens rather than whole words or raw characters.",
  criteria: [
    {
      id: "defines-token",
      description:
        "Correctly states a token is the atomic unit the model reads/produces — a chunk of text (subword), not necessarily a whole word.",
      points: 4,
    },
    {
      id: "subword-rationale",
      description:
        "Explains a concrete reason for subword tokenization: bounded vocabulary while still covering rare/unseen words, avoiding a huge whole-word vocab or overly long char sequences.",
      points: 4,
    },
    {
      id: "consequence",
      description:
        "Notes a real consequence, e.g. one word can be multiple tokens, or token count (not word count) drives context limits/cost.",
      points: 2,
    },
  ] satisfies RubricCriterion[],
  guidance:
    "Subword schemes (e.g. BPE) balance vocabulary size against sequence length; " +
    "unknown words decompose into known subword pieces.",
};

// ── Question B: embeddings ──────────────────────────────────────────────────
const Q_EMBEDDINGS = {
  questionPrompt:
    "What is an embedding vector, and what does it mean for two embeddings to be " +
    "close in the vector space?",
  criteria: [
    {
      id: "defines-embedding",
      description:
        "States an embedding is a fixed-length vector of numbers that represents a token/text in a continuous space learned by the model.",
      points: 4,
    },
    {
      id: "semantic-geometry",
      description:
        "Explains that distance/similarity (e.g. cosine) encodes semantic relatedness — close vectors mean similar meaning/usage.",
      points: 4,
    },
  ] satisfies RubricCriterion[],
};

export const FIXTURES: GraderFixture[] = [
  // — Question A —
  {
    id: "tok-correct",
    category: "correct",
    ...Q_TOKENIZATION,
    learnerResponse:
      "A token is the atomic unit an LLM actually reads and generates: a chunk of " +
      "text that is often a subword piece rather than a full word. Models use " +
      "subword tokenization (like BPE) because it keeps the vocabulary at a fixed, " +
      "manageable size while still being able to represent rare or never-before-seen " +
      "words by splitting them into known pieces — a whole-word vocabulary would be " +
      "enormous and still miss new words, and pure characters make sequences far too " +
      "long. A practical consequence is that a single word can become several tokens, " +
      "so it is token count, not word count, that determines the context window and cost.",
    expectedBand: [0.85, 1.0],
  },
  {
    id: "tok-partial",
    category: "partial",
    ...Q_TOKENIZATION,
    learnerResponse:
      "A token is a piece of text the model reads, usually a part of a word. Models " +
      "break text into tokens before processing it.",
    // defines-token yes; no rationale, no consequence.
    expectedBand: [0.25, 0.55],
  },
  {
    id: "tok-vague-trap",
    category: "vague-trap",
    ...Q_TOKENIZATION,
    learnerResponse:
      "Tokens are a really important part of how language models work. They are " +
      "fundamental to the whole process, and subword tokenization is used because it " +
      "is more efficient and works better for the model overall. Modern LLMs rely on " +
      "them heavily, which is why they matter so much.",
    // Plausible tone, zero actual content. Must be denied credit.
    expectedBand: [0.0, 0.25],
  },
  {
    id: "tok-wrong",
    category: "wrong",
    ...Q_TOKENIZATION,
    learnerResponse:
      "A token is always exactly one English word — the model has a dictionary with " +
      "one entry per word and looks each word up. It never splits words, and every " +
      "word is a single token, which is why word count and token count are identical.",
    expectedBand: [0.0, 0.2],
  },
  {
    id: "tok-offtopic",
    category: "offtopic",
    ...Q_TOKENIZATION,
    learnerResponse:
      "Attention lets the model weigh different positions in the sequence, and " +
      "transformers stack many attention layers with residual connections and layer " +
      "normalization to learn long-range dependencies.",
    expectedBand: [0.0, 0.1],
  },
  {
    id: "tok-empty",
    category: "empty",
    ...Q_TOKENIZATION,
    learnerResponse: "idk",
    expectedBand: [0.0, 0.0],
  },
  // — Question B —
  {
    id: "emb-correct",
    category: "correct",
    ...Q_EMBEDDINGS,
    learnerResponse:
      "An embedding is a fixed-length vector of real numbers that the model learns to " +
      "represent a token or piece of text in a continuous space. When two embeddings " +
      "are close together — for example, a small cosine distance between them — it " +
      "means the model considers those texts semantically similar: they tend to have " +
      "related meaning or appear in similar contexts.",
    expectedBand: [0.85, 1.0],
  },
  {
    id: "emb-partial",
    category: "partial",
    ...Q_EMBEDDINGS,
    learnerResponse:
      "An embedding is a list of numbers that represents a word as a vector so the " +
      "computer can work with it mathematically.",
    // defines-embedding roughly; no semantic-geometry.
    expectedBand: [0.2, 0.55],
  },
  {
    id: "emb-vague-trap",
    category: "vague-trap",
    ...Q_EMBEDDINGS,
    learnerResponse:
      "Embeddings are how models understand meaning. Two embeddings being close is a " +
      "key idea in machine learning and is very useful for lots of NLP tasks, which " +
      "is why embeddings are so powerful and widely used in modern AI systems.",
    expectedBand: [0.0, 0.25],
  },
  {
    id: "emb-wrong",
    category: "wrong",
    ...Q_EMBEDDINGS,
    learnerResponse:
      "An embedding is the single integer id assigned to each word in the vocabulary. " +
      "Two embeddings are close when their id numbers are near each other — word 500 " +
      "and word 501 are basically the same meaning because their ids are adjacent.",
    expectedBand: [0.0, 0.2],
  },
  {
    id: "emb-empty",
    category: "empty",
    ...Q_EMBEDDINGS,
    learnerResponse: "",
    expectedBand: [0.0, 0.0],
  },
];
