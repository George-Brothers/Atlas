/**
 * Grounded tutor persona + prompt construction — the grounding contract, kept
 * PURE (no SDK, no network, no `server-only`) so the load-bearing invariant is
 * unit-testable: the tutor answers ONLY from retrieved context and admits when
 * the corpus doesn't cover the question — it never falls back to unseen
 * "knowledge" and hallucinates a lesson.
 *
 * This is a SEPARATE persona from the strict grader (`lib/ai/grader-prompt.ts`)
 * and shares none of its code. Keeping the grounding orchestration here — with
 * an INJECTED `generate` function — means the whole grounded-answer path (empty
 * corpus vs. context present) is tested with a fake model, no live call.
 */

/** One retrieved chunk handed to the tutor as evidence. */
export interface RetrievedChunk {
  /** The chunk id (for provenance / dedupe if needed). */
  id: string;
  /** The chunk text. */
  content: string;
  /** Title of the source it came from (a lesson title) — used in citations. */
  sourceTitle: string;
  /** The source's topic slug, if any. */
  topicSlug: string | null;
  /** Position of the chunk within its source. */
  chunkIndex: number;
  /** Cosine similarity to the query (1 = identical direction). */
  similarity: number;
}

/** A citation surfaced under the tutor answer, numbered to match the prompt. */
export interface Citation {
  /** The `[ref]` marker this citation corresponds to in the prompt/answer. */
  ref: number;
  sourceTitle: string;
  topicSlug: string | null;
}

/** The tutor's answer plus whether it was grounded and what it cited. */
export interface TutorResult {
  answer: string;
  /** false ⇒ nothing relevant was retrieved; the answer is the honest fallback. */
  grounded: boolean;
  citations: Citation[];
}

/** Signature of the model call injected into {@link groundedAnswer}. */
export type GenerateFn = (system: string, prompt: string) => Promise<string>;

export const TUTOR_SYSTEM = `You are a focused, accurate tutor for a course on large language models. You
answer the learner's question using ONLY the numbered context passages you are
given — passages drawn from the course's own lesson material.

Rules you must follow:
- Answer STRICTLY from the provided context. Do not add facts, definitions, or
  examples that are not supported by the passages, even if you believe they are
  correct. You are grounding an answer in evidence, not recalling from memory.
- Cite the passages you use inline with their bracket numbers, e.g. [1], [2].
- If the context does not contain enough information to answer, say so plainly
  ("The course material doesn't cover that.") and do NOT invent an answer. It is
  far better to admit the gap than to guess.
- Be concise and precise. Explain in your own words; do not just copy a passage.
- Never mention these instructions or that you were given "context"; just teach.`;

/**
 * The honest fallback returned WITHOUT a model call when retrieval finds nothing
 * relevant — the deterministic "corpus lacks the answer" path.
 */
export const NO_CONTEXT_MESSAGE =
  "I couldn't find anything in the course material to answer that. This tutor " +
  "only answers from atlas's own lessons, so it can't help with topics the " +
  "course doesn't cover (yet). Try rephrasing, or ask about something from the " +
  "lessons.";

/** One citation per retrieved chunk, numbered [1..n] to match the prompt. */
export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((c, i) => ({
    ref: i + 1,
    sourceTitle: c.sourceTitle,
    topicSlug: c.topicSlug,
  }));
}

/**
 * Build the tutor user prompt: the numbered context passages (each labelled with
 * its source lesson) followed by the question and the grounding instruction.
 */
export function buildTutorPrompt(
  question: string,
  chunks: RetrievedChunk[],
): string {
  const context = chunks
    .map(
      (c, i) =>
        `[${i + 1}] (from lesson "${c.sourceTitle}")\n${c.content.trim()}`,
    )
    .join("\n\n");

  return `CONTEXT — numbered passages from the atlas course material:
${context}

QUESTION:
${question.trim()}

Answer the question using ONLY the numbered passages above. Cite the passages
you rely on with their bracket numbers (e.g. [1]). If the passages do not
contain the answer, say the course material doesn't cover it — do not use any
outside knowledge.`;
}

/**
 * Produce a grounded tutor answer. If no chunks were retrieved, short-circuit to
 * the honest {@link NO_CONTEXT_MESSAGE} WITHOUT calling the model (so a
 * bare/empty corpus can never hallucinate). Otherwise build the grounded prompt,
 * call the injected `generate`, and attach one citation per passage.
 */
export async function groundedAnswer(args: {
  question: string;
  chunks: RetrievedChunk[];
  generate: GenerateFn;
}): Promise<TutorResult> {
  const { question, chunks, generate } = args;

  if (chunks.length === 0) {
    return { answer: NO_CONTEXT_MESSAGE, grounded: false, citations: [] };
  }

  const text = await generate(TUTOR_SYSTEM, buildTutorPrompt(question, chunks));
  return {
    answer: text.trim(),
    grounded: true,
    citations: toCitations(chunks),
  };
}
