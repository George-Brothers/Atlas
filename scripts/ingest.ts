/**
 * Ingest script — index atlas's OWN authored lessons into `source`/`source_chunk`.
 *
 * The retrieval corpus. For every published lesson it: flattens the teaching
 * text, chunks it (`lib/rag/ingest.ts`), embeds each chunk with OpenAI
 * `text-embedding-3-small` (`lib/ai/embeddings.ts`), and writes one `source` row
 * (kind="lesson", linked to the lesson's gate topic) plus its `source_chunk`
 * rows with 1536-dim embeddings — exactly what `retrieveTopK` searches.
 *
 * SCOPE: only atlas's own lessons. It never fetches external URLs or the
 * captain's Obsidian vault — that is a different lane's job.
 *
 * Idempotent: the source for a topic is get-or-create by (kind="lesson",
 * topic_id); its chunks are DELETED and re-embedded on every run, so re-running
 * after editing a lesson refreshes the index in place. Safe to re-run.
 *
 * Run (needs DATABASE_URL and OPENAI_API_KEY; run AFTER `npm run db:seed` so the
 * topics exist):
 *   npm run db:ingest      # -> tsx scripts/ingest.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { source, sourceChunk, topic } from "@/lib/db/schema";
import { LESSONS } from "@/lib/content";
import { buildLessonDocuments } from "@/lib/rag/ingest";
import { embedTexts, getOpenAIApiKey, EMBEDDING_MODEL } from "@/lib/ai/embeddings";

async function ingest() {
  if (!getOpenAIApiKey()) {
    console.error(
      "\n✗ No OpenAI credential. Set OPENAI_API_KEY (direct OpenAI API key)\n" +
        "  before ingesting — chunks are embedded with " +
        `${EMBEDDING_MODEL}.\n`,
    );
    process.exit(2);
  }

  const db = getDb();
  const docs = buildLessonDocuments(LESSONS);

  // Resolve each lesson's gate topic to its id (topics must already be seeded).
  const topicRows = await db
    .select({ id: topic.id, slug: topic.slug })
    .from(topic)
    .where(
      inArray(
        topic.slug,
        docs.map((d) => d.topicSlug),
      ),
    );
  const topicIdBySlug = new Map(topicRows.map((r) => [r.slug, r.id]));

  let sourcesUpserted = 0;
  let chunksInserted = 0;
  let skipped = 0;

  for (const doc of docs) {
    const topicId = topicIdBySlug.get(doc.topicSlug);
    if (!topicId) {
      console.warn(
        `• skip "${doc.topicSlug}" — topic not found (run \`npm run db:seed\` first).`,
      );
      skipped++;
      continue;
    }

    // Get-or-create the lesson source, keyed by (kind, topic).
    const existing = await db
      .select({ id: source.id })
      .from(source)
      .where(and(eq(source.kind, doc.kind), eq(source.topicId, topicId)))
      .limit(1);

    let sourceId: string;
    if (existing[0]) {
      sourceId = existing[0].id;
      await db
        .update(source)
        .set({ title: doc.title, fetchedAt: new Date() })
        .where(eq(source.id, sourceId));
      // Re-index cleanly: drop stale chunks before re-inserting fresh ones.
      await db.delete(sourceChunk).where(eq(sourceChunk.sourceId, sourceId));
    } else {
      const [row] = await db
        .insert(source)
        .values({
          title: doc.title,
          kind: doc.kind,
          trustTier: "authored",
          topicId,
          fetchedAt: new Date(),
        })
        .returning({ id: source.id });
      sourceId = row.id;
    }
    sourcesUpserted++;

    // Embed all of this lesson's chunks in one batched request, then insert.
    const embeddings = await embedTexts(doc.chunks.map((c) => c.content));
    if (embeddings.length !== doc.chunks.length) {
      throw new Error(
        `Embedding count (${embeddings.length}) != chunk count (${doc.chunks.length}) for "${doc.topicSlug}".`,
      );
    }
    await db.insert(sourceChunk).values(
      doc.chunks.map((c, i) => ({
        sourceId,
        content: c.content,
        chunkIndex: c.index,
        embedding: embeddings[i],
        tokenCount: c.tokenCount,
      })),
    );
    chunksInserted += doc.chunks.length;
    console.log(
      `✓ ${doc.topicSlug.padEnd(28)} ${doc.chunks.length} chunks embedded`,
    );
  }

  console.log(
    `\nIngested ${chunksInserted} chunks across ${sourcesUpserted} lesson source(s)` +
      `${skipped ? `, skipped ${skipped}` : ""}. Model: ${EMBEDDING_MODEL}.`,
  );
}

ingest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Ingest failed:", err);
    process.exit(1);
  });
