/**
 * Unit tests for the M4 retrieval / grounded-tutor logic (run via `npm test` /
 * `node --test`). Deterministic, NO live DB and NO API key: they cover the
 * pieces that must be correct offline —
 *   - chunking (bounds, overlap, boundary fallbacks),
 *   - lesson-text extraction (what enters the corpus; what is kept out),
 *   - cosine similarity + top-k ranking (the retrieval semantics),
 *   - the grounded-answer path (empty corpus fallback vs. context present),
 *   - the embeddings model pin + fail-closed key contract.
 *
 * The LIVE calls (OpenAI embeddings, DeepSeek generation, the pgvector query)
 * are intentionally NOT exercised here; the grounded path is tested with an
 * injected fake model, and retrieval ranking with the pure ranker.
 *
 * Uses `.ts` import specifiers because Node runs these directly via native
 * type-stripping; `test/` is excluded from tsconfig.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  chunkText,
} from "../lib/rag/chunk.ts";
import {
  extractLessonText,
  buildLessonDocuments,
} from "../lib/rag/ingest.ts";
import {
  cosineSimilarity,
  rankBySimilarity,
  type EmbeddedItem,
} from "../lib/rag/similarity.ts";
import {
  TUTOR_SYSTEM,
  NO_CONTEXT_MESSAGE,
  buildTutorPrompt,
  toCitations,
  groundedAnswer,
  type RetrievedChunk,
} from "../lib/ai/tutor-prompt.ts";
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  getOpenAIApiKey,
} from "../lib/ai/embeddings.ts";
import type { AuthoredLesson } from "../lib/content/types.ts";

/* ------------------------------- chunking --------------------------------- */

test("estimateTokens is 0 for empty/whitespace and grows with length", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("   \n  "), 0);
  assert.ok(estimateTokens("hello world") > 0);
  assert.ok(estimateTokens("a".repeat(400)) > estimateTokens("a".repeat(40)));
});

test("chunkText returns nothing for empty input", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n\n  "), []);
});

test("chunkText keeps a short text as a single chunk", () => {
  const chunks = chunkText("A short paragraph about tokens.", {
    targetTokens: 256,
  });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].index, 0);
  assert.match(chunks[0].content, /tokens/);
  assert.equal(chunks[0].tokenCount, estimateTokens(chunks[0].content));
});

test("chunkText splits long multi-paragraph text into bounded, ordered chunks", () => {
  const para = (n: number) =>
    `Paragraph ${n}. ` + "meaning as geometry ".repeat(20);
  const text = [para(1), para(2), para(3), para(4), para(5)].join("\n\n");
  const target = 80;
  const chunks = chunkText(text, { targetTokens: target, overlapTokens: 10 });

  assert.ok(chunks.length > 1, "expected multiple chunks");
  // Indices are contiguous from 0.
  chunks.forEach((c, i) => assert.equal(c.index, i));
  // No chunk wildly exceeds the target (allow overlap + one boundary unit slop).
  for (const c of chunks) {
    assert.ok(
      c.tokenCount <= target * 2,
      `chunk ${c.index} too big: ${c.tokenCount} tokens`,
    );
  }
});

test("chunkText overlaps adjacent chunks so a boundary idea stays intact", () => {
  const sentences = Array.from(
    { length: 12 },
    (_, i) => `Sentence number ${i} explains an important concept clearly.`,
  ).join(" ");
  const chunks = chunkText(sentences, { targetTokens: 40, overlapTokens: 15 });
  assert.ok(chunks.length >= 2);
  // The tail of chunk 0 should reappear at the head of chunk 1 (overlap).
  const firstWordsOfSecond = chunks[1].content.split(" ").slice(0, 4).join(" ");
  assert.ok(
    chunks[0].content.includes(firstWordsOfSecond),
    "expected overlap between consecutive chunks",
  );
});

test("chunkText hard-splits a single oversized sentence with no boundaries", () => {
  const huge = "word ".repeat(400).trim(); // one long space-joined run
  const chunks = chunkText(huge, { targetTokens: 50, overlapTokens: 0 });
  assert.ok(chunks.length > 1, "a huge unit must be split, not dropped");
  // Every word is preserved across chunks.
  const totalWords = chunks
    .map((c) => c.content.split(/\s+/).length)
    .reduce((a, b) => a + b, 0);
  assert.ok(totalWords >= 400);
});

/* --------------------------- lesson extraction ---------------------------- */

const demoLesson: AuthoredLesson = {
  topicSlug: "demo",
  title: "Demo lesson",
  status: "published",
  objectives: ["Explain what a token is", "Apply cosine similarity"],
  blocks: [
    {
      kind: "prose",
      body: { heading: "Introduction", markdown: "Tokens are subword units." },
    },
    {
      kind: "worked_example",
      body: { title: "Worked example", markdown: "Compute a dot product here." },
    },
    {
      kind: "applied_task",
      body: { title: "Applied task", markdown: "Build a tiny retriever." },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt: "Define a retrieval miss.",
        rubric: "Mentions the top-k not containing the answer.",
        explanation: "A miss is an upstream retrieval failure.",
      },
    },
    {
      kind: "mermaid",
      body: { diagram: "flowchart LR; A-->B", caption: "SECRETDIAGRAM" },
    },
    {
      kind: "citation",
      body: {
        label: "External Paper",
        url: "https://example.com/EXTERNALURL",
        note: "A paper we point at but do not index.",
      },
    },
  ],
};

test("extractLessonText includes teaching text + objectives", () => {
  const text = extractLessonText(demoLesson);
  for (const needle of [
    "Explain what a token is",
    "Introduction",
    "Tokens are subword units.",
    "Compute a dot product here.",
    "Build a tiny retriever.",
    "Define a retrieval miss.",
    "Mentions the top-k not containing the answer.",
    "A miss is an upstream retrieval failure.",
  ]) {
    assert.ok(text.includes(needle), `expected extracted text to include: ${needle}`);
  }
});

test("extractLessonText excludes external citation URLs and raw diagram source", () => {
  const text = extractLessonText(demoLesson);
  // atlas indexes ONLY its own lesson content — never external URLs or the
  // mermaid graph source.
  assert.ok(!text.includes("EXTERNALURL"), "must not index external citation URLs");
  assert.ok(!text.includes("flowchart"), "must not index mermaid diagram source");
  assert.ok(!text.includes("SECRETDIAGRAM"));
});

test("buildLessonDocuments chunks published lessons and drops stubs", () => {
  const stub: AuthoredLesson = {
    topicSlug: "stub",
    title: "Stub lesson",
    status: "stub",
    objectives: ["Some objective"],
    // no blocks
  };
  const docs = buildLessonDocuments([demoLesson, stub], { targetTokens: 40 });
  assert.equal(docs.length, 1, "stub lesson must be excluded from the corpus");
  const doc = docs[0];
  assert.equal(doc.topicSlug, "demo");
  assert.equal(doc.title, "Demo lesson");
  assert.equal(doc.kind, "lesson");
  assert.ok(doc.chunks.length >= 1);
  doc.chunks.forEach((c, i) => assert.equal(c.index, i));
});

/* --------------------------- similarity / rank ---------------------------- */

test("cosineSimilarity: identical=1, orthogonal=0, opposite=-1", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-12);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 2], [-1, -2]) + 1) < 1e-12);
});

test("cosineSimilarity handles zero vectors and length mismatch as 0", () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test("rankBySimilarity returns the top-k most similar, most-similar first", () => {
  const query = [1, 0, 0];
  const items: EmbeddedItem<string>[] = [
    { embedding: [0, 1, 0], item: "orthogonal" },
    { embedding: [0.9, 0.1, 0], item: "near" },
    { embedding: [1, 0, 0], item: "exact" },
    { embedding: [-1, 0, 0], item: "opposite" },
  ];
  const top2 = rankBySimilarity(query, items, 2);
  assert.equal(top2.length, 2);
  assert.equal(top2[0].item, "exact");
  assert.equal(top2[1].item, "near");
  assert.ok(top2[0].similarity >= top2[1].similarity);
});

test("rankBySimilarity: k<=0 → [], k>n → all ranked", () => {
  const query = [1, 0];
  const items: EmbeddedItem<number>[] = [
    { embedding: [1, 0], item: 1 },
    { embedding: [0, 1], item: 2 },
  ];
  assert.deepEqual(rankBySimilarity(query, items, 0), []);
  assert.deepEqual(rankBySimilarity(query, items, -3), []);
  assert.equal(rankBySimilarity(query, items, 99).length, 2);
});

/* -------------------------- grounded-answer path -------------------------- */

const sampleChunks: RetrievedChunk[] = [
  {
    id: "chunk-a",
    content: "Cosine similarity measures the angle between two vectors.",
    sourceTitle: "Tokens & embeddings",
    topicSlug: "tokens-embeddings",
    chunkIndex: 0,
    similarity: 0.91,
  },
  {
    id: "chunk-b",
    content: "RAG retrieves the top-k nearest chunks and conditions the prompt.",
    sourceTitle: "Retrieval-augmented generation",
    topicSlug: "rag",
    chunkIndex: 3,
    similarity: 0.82,
  },
];

test("TUTOR_SYSTEM enforces the grounding contract", () => {
  assert.match(TUTOR_SYSTEM, /ONLY the .*context/i);
  assert.match(TUTOR_SYSTEM, /does not contain|doesn't cover/i);
  assert.match(TUTOR_SYSTEM, /do not invent|do NOT invent/i);
});

test("buildTutorPrompt numbers passages, labels sources, and includes the question", () => {
  const prompt = buildTutorPrompt("How does retrieval work?", sampleChunks);
  assert.ok(prompt.includes("[1]"));
  assert.ok(prompt.includes("[2]"));
  assert.ok(prompt.includes("Cosine similarity measures the angle"));
  assert.ok(prompt.includes("RAG retrieves the top-k"));
  assert.ok(prompt.includes('from lesson "Tokens & embeddings"'));
  assert.ok(prompt.includes("How does retrieval work?"));
  assert.match(prompt, /ONLY the numbered passages/i);
});

test("toCitations emits one citation per chunk, numbered [1..n]", () => {
  const cites = toCitations(sampleChunks);
  assert.equal(cites.length, 2);
  assert.deepEqual(
    cites.map((c) => c.ref),
    [1, 2],
  );
  assert.equal(cites[0].sourceTitle, "Tokens & embeddings");
  assert.equal(cites[1].topicSlug, "rag");
});

test("groundedAnswer: empty corpus returns the honest fallback WITHOUT calling the model", async () => {
  let called = false;
  const generate = async () => {
    called = true;
    return "SHOULD NOT HAPPEN";
  };
  const result = await groundedAnswer({
    question: "What is a monad?",
    chunks: [],
    generate,
  });
  assert.equal(called, false, "the model must not be called with no context");
  assert.equal(result.grounded, false);
  assert.equal(result.answer, NO_CONTEXT_MESSAGE);
  assert.deepEqual(result.citations, []);
});

test("groundedAnswer: with context, grounds on the injected model and cites passages", async () => {
  const calls: { system: string; prompt: string }[] = [];
  const generate = async (system: string, prompt: string) => {
    calls.push({ system, prompt });
    return "  Retrieval finds the nearest chunks by cosine [1][2].  ";
  };
  const result = await groundedAnswer({
    question: "How does retrieval work?",
    chunks: sampleChunks,
    generate,
  });

  assert.equal(calls.length, 1, "exactly one grounded model call");
  assert.equal(calls[0].system, TUTOR_SYSTEM);
  assert.ok(calls[0].prompt.includes("How does retrieval work?"));
  assert.equal(result.grounded, true);
  // Answer is trimmed.
  assert.equal(
    result.answer,
    "Retrieval finds the nearest chunks by cosine [1][2].",
  );
  assert.equal(result.citations.length, 2);
  assert.deepEqual(
    result.citations.map((c) => c.sourceTitle),
    ["Tokens & embeddings", "Retrieval-augmented generation"],
  );
});

/* ----------------------------- embeddings pin ----------------------------- */

test("embedding model is pinned to the exact 1536-dim id", () => {
  // The vector column is fixed at 1536; this model must output exactly that,
  // and the id must be exactly as required (no substitution).
  assert.equal(EMBEDDING_MODEL, "text-embedding-3-small");
  assert.equal(EMBEDDING_DIMENSIONS, 1536);
});

test("getOpenAIApiKey reads OPENAI_API_KEY (trimmed, empty → undefined)", () => {
  assert.equal(getOpenAIApiKey({}), undefined);
  assert.equal(getOpenAIApiKey({ OPENAI_API_KEY: "sk-openai" }), "sk-openai");
  assert.equal(getOpenAIApiKey({ OPENAI_API_KEY: "   " }), undefined);
  assert.equal(getOpenAIApiKey({ OPENAI_API_KEY: "" }), undefined);
});
