/**
 * Top-k cosine retrieval over `source_chunk` (the pgvector / HNSW half of RAG).
 *
 * Server-only: needs a live DB (`getDb` throws without `DATABASE_URL`). The
 * query orders by the pgvector cosine-distance operator `<=>` with a `LIMIT`,
 * which is exactly the shape the HNSW index (`source_chunk_embedding_hnsw_idx`,
 * built with `vector_cosine_ops`) accelerates — approximate-nearest-neighbour in
 * sub-linear time. `similarity = 1 - distance`, so bigger is more relevant.
 *
 * The ranking SEMANTICS (nearest by cosine) are pinned by pure unit tests in
 * `lib/rag/similarity.ts`; this module is the DB expression of the same idea.
 */
import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { source, sourceChunk, topic } from "@/lib/db/schema";
import type { RetrievedChunk } from "@/lib/ai/tutor-prompt";

export interface RetrieveOptions {
  /** Restrict retrieval to sources about this topic (the "this topic" scope). */
  topicId?: string | null;
}

/**
 * Retrieve the `k` chunks most similar to `queryEmbedding` by cosine similarity,
 * most-similar first, each with its source lesson title + topic slug for
 * citation. Optionally scoped to a single topic. Returns [] for a non-positive
 * `k`. Requires a live DB and that chunks were embedded with the SAME model as
 * the query (see `lib/ai/embeddings.ts`).
 */
export async function retrieveTopK(
  queryEmbedding: number[],
  k: number,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  if (k <= 0) return [];

  const db = getDb();
  // Bind the query vector once and cast it to `vector` explicitly so the driver
  // never leaves the parameter as untyped text (which would break the operator).
  const embeddingParam = JSON.stringify(queryEmbedding);
  const distance = sql<number>`${sourceChunk.embedding} <=> ${embeddingParam}::vector`;
  const similarity = sql<number>`1 - (${sourceChunk.embedding} <=> ${embeddingParam}::vector)`;

  const rows = await db
    .select({
      id: sourceChunk.id,
      content: sourceChunk.content,
      chunkIndex: sourceChunk.chunkIndex,
      sourceTitle: source.title,
      topicSlug: topic.slug,
      similarity,
    })
    .from(sourceChunk)
    .innerJoin(source, eq(sourceChunk.sourceId, source.id))
    .leftJoin(topic, eq(source.topicId, topic.id))
    .where(
      and(
        isNotNull(sourceChunk.embedding),
        options.topicId ? eq(source.topicId, options.topicId) : undefined,
      ),
    )
    .orderBy(distance)
    .limit(k);

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    sourceTitle: r.sourceTitle ?? "Untitled source",
    topicSlug: r.topicSlug ?? null,
    chunkIndex: r.chunkIndex,
    similarity: Number(r.similarity),
  }));
}
