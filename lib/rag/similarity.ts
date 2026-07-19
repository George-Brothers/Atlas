/**
 * Cosine similarity + top-k ranking — the retrieval math, kept pure.
 *
 * In production the top-k search runs in Postgres over the HNSW index (see
 * `lib/rag/retrieve.ts`), which is what makes it fast at scale. This module is
 * the SAME ranking semantics expressed in plain TypeScript: it documents and
 * unit-tests exactly what "nearest by cosine" means (and is a correct, if
 * linear, fallback ranker), so the ordering the DB is expected to produce is
 * pinned by tests with no live database.
 */

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1]. Returns 0 if
 * either vector is all-zeros (undefined direction) or the lengths differ.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** An item carrying an embedding, ranked by {@link rankBySimilarity}. */
export interface EmbeddedItem<T> {
  embedding: number[];
  item: T;
}

/** One ranked result: the item plus its cosine similarity to the query. */
export interface RankedItem<T> {
  item: T;
  similarity: number;
}

/**
 * Rank `items` by cosine similarity to `queryEmbedding`, most-similar first, and
 * return the top `k`. Ties keep their original input order (stable sort); `k`
 * larger than the input just returns everything ranked; `k <= 0` returns [].
 */
export function rankBySimilarity<T>(
  queryEmbedding: number[],
  items: EmbeddedItem<T>[],
  k: number,
): RankedItem<T>[] {
  if (k <= 0) return [];
  return items
    .map((entry) => ({
      item: entry.item,
      similarity: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, k);
}
