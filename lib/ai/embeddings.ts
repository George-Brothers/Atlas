/**
 * Embeddings provider (direct OpenAI) — the retrieval half of atlas's AI wiring.
 *
 * Mirrors `lib/ai/index.ts`: a thin, swappable wrapper that talks to a provider
 * DIRECTLY (no Vercel AI Gateway). Where the grader slot uses DeepSeek, the
 * embeddings slot uses **OpenAI** via `@ai-sdk/openai` — the one embedding model
 * whose native output width (1536) matches the fixed `source_chunk.embedding
 * vector(1536)` column, so no dimension juggling is ever needed.
 *
 * MODEL: `text-embedding-3-small` — pinned as a constant on purpose. The column
 * width is fixed at 1536, and this model outputs exactly 1536 dims natively;
 * swapping the id (e.g. to `-3-large`, 3072 dims) would silently break inserts.
 * It is deliberately NOT env-overridable.
 *
 * Auth: OpenAI authenticates via `OPENAI_API_KEY`. Fail-closed exactly like the
 * grader — `getOpenAIProvider()` throws a clear error when the key is unset, but
 * ONLY when an embedding is actually requested, so imports (and the build) never
 * need a credential.
 *
 * Building a handle does not hit the API; the metered call happens when
 * `embedTexts` / `embedQuery` run — the ingest script (offline) and the grounded
 * tutor's query step (live loop). Authoring/build stay offline.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

/** The exact embedding model. Pinned to match the 1536-wide vector column. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Native output width of {@link EMBEDDING_MODEL}; equals the column's dims. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * The OpenAI API key, or undefined if none is configured. Exported so callers
 * and scripts can check configuration (and fail with a helpful message) without
 * constructing a provider.
 */
export function getOpenAIApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env.OPENAI_API_KEY;
  return value && value.trim() ? value : undefined;
}

let openaiProvider: ReturnType<typeof createOpenAI> | undefined;

/**
 * Lazily construct the direct OpenAI provider. Throws a clear, fail-closed
 * error if `OPENAI_API_KEY` is unset — but only when an embedding is actually
 * requested, never at import time.
 */
function getOpenAIProvider(): ReturnType<typeof createOpenAI> {
  if (!openaiProvider) {
    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      throw new Error(
        "No OpenAI credential found. Set OPENAI_API_KEY (direct OpenAI API " +
          "key) to embed source chunks or tutor queries. See .env.example.",
      );
    }
    openaiProvider = createOpenAI({ apiKey });
  }
  return openaiProvider;
}

/** The embedding model handle (built lazily; construction hits no network). */
function embeddingModel() {
  return getOpenAIProvider().textEmbeddingModel(EMBEDDING_MODEL);
}

/**
 * Embed many texts in one batched request set (the AI SDK handles chunking the
 * batch and parallelism). Returns one 1536-dim vector per input, in order.
 * Requires `OPENAI_API_KEY` at call time.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: embeddingModel(),
    values: texts,
  });
  return embeddings;
}

/**
 * Embed a single query string into one 1536-dim vector, using the SAME model as
 * the corpus so query and chunk vectors live in the same space (a hard
 * requirement for cosine retrieval to be meaningful). Requires `OPENAI_API_KEY`.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel(), value: text });
  return embedding;
}
