/**
 * Ingestion extraction — turn atlas's OWN authored lessons into ingestible
 * documents. Pure and deterministic (no DB / network / key) so the extraction +
 * chunking is unit-tested; the runnable side (embed + write to Postgres) lives
 * in `scripts/ingest.ts`.
 *
 * SCOPE (load-bearing): atlas's retrieval corpus indexes ONLY its own authored
 * lesson content. We extract the teaching prose the learner actually reads —
 * prose, worked examples, applied tasks, and inline recall checks — plus the
 * lesson objectives. We deliberately DO NOT fetch or index the external URLs in
 * citation blocks: those point at other people's material, and pulling them in
 * is a different project's job (the research/Obsidian lane), not this corpus.
 *
 * `import type` keeps the content-type dependency erased at runtime, so
 * `node --test` can type-strip this file without resolving the `@/` alias chain.
 */
import { chunkText, type Chunk, type ChunkOptions } from "./chunk.ts";
import type {
  AuthoredLesson,
  AppliedTaskBody,
  ProseBody,
  RecallCheckBody,
  WorkedExampleBody,
} from "../content/types.ts";

/** One document to ingest: a lesson's teaching text, flattened and chunked. */
export interface IngestDocument {
  /** The spine topic this lesson gates (used to link the `source` to a topic). */
  topicSlug: string;
  /** Human title for the `source` row and tutor citations (the lesson title). */
  title: string;
  /** `source.kind` — always "lesson" for the authored corpus. */
  kind: "lesson";
  /** The flattened teaching text this document was built from. */
  text: string;
  /** The token-bounded chunks to embed and store. */
  chunks: Chunk[];
}

/**
 * Flatten one lesson into the plain teaching text worth retrieving over: its
 * objectives, then each readable block in order. Returns "" for a stub (no
 * blocks) so the caller can skip it.
 */
export function extractLessonText(lesson: AuthoredLesson): string {
  const parts: string[] = [];

  if (lesson.objectives.length > 0) {
    parts.push(
      `${lesson.title}\n\nBy the end you can:\n${lesson.objectives
        .map((o) => `- ${o}`)
        .join("\n")}`,
    );
  }

  for (const block of lesson.blocks ?? []) {
    switch (block.kind) {
      case "prose": {
        const b = block.body as ProseBody;
        parts.push([b.heading, b.markdown].filter(Boolean).join("\n\n"));
        break;
      }
      case "worked_example": {
        const b = block.body as WorkedExampleBody;
        parts.push(`${b.title}\n\n${b.markdown}`);
        break;
      }
      case "applied_task": {
        const b = block.body as AppliedTaskBody;
        parts.push(`${b.title}\n\n${b.markdown}`);
        break;
      }
      case "recall_check": {
        const b = block.body as RecallCheckBody;
        parts.push(
          [b.prompt, b.rubric, b.explanation].filter(Boolean).join("\n\n"),
        );
        break;
      }
      // mermaid diagrams (graph source) and citation blocks (external pointers)
      // are intentionally not part of the retrieval corpus.
      default:
        break;
    }
  }

  return parts.filter((p) => p.trim()).join("\n\n").trim();
}

/**
 * Build the ingestible document set from authored lessons: extract each lesson's
 * teaching text, chunk it, and drop any lesson that yields no chunks (stubs).
 * Deterministic given the same lessons + options.
 */
export function buildLessonDocuments(
  lessons: AuthoredLesson[],
  options?: ChunkOptions,
): IngestDocument[] {
  const docs: IngestDocument[] = [];
  for (const lesson of lessons) {
    // Stubs (no teaching blocks) carry no material worth retrieving over.
    if (!lesson.blocks || lesson.blocks.length === 0) continue;
    const text = extractLessonText(lesson);
    const chunks = chunkText(text, options);
    if (chunks.length === 0) continue;
    docs.push({
      topicSlug: lesson.topicSlug,
      title: lesson.title,
      kind: "lesson",
      text,
      chunks,
    });
  }
  return docs;
}
