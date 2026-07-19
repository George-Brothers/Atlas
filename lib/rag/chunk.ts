/**
 * Text chunking — the first step of ingestion, kept pure and deterministic.
 *
 * No DB, no network, no API key: chunking is unit-tested in isolation
 * (`test/rag.test.ts`). Uses `.ts`-less imports only (it has no relative
 * imports) so `node --test` type-strips it directly.
 *
 * Strategy: pack text into token-bounded chunks on natural boundaries
 * (paragraphs, then sentences, then — only if a single sentence is still too
 * big — words), with a small sentence-level OVERLAP carried between adjacent
 * chunks so an idea split across a boundary still appears whole in one chunk.
 * The chunk is the atomic unit of retrieval, so bounded size + overlap is what
 * keeps a single relevant passage both findable and self-contained.
 */

/** A single chunk produced by {@link chunkText}. */
export interface Chunk {
  /** The chunk's text. */
  content: string;
  /** 0-based position of this chunk within its source. */
  index: number;
  /** Estimated token count of {@link content} (see {@link estimateTokens}). */
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target tokens per chunk (a soft cap the packer aims for). Default 256. */
  targetTokens?: number;
  /** Tokens of trailing context to repeat at the start of the next chunk. Default 40. */
  overlapTokens?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetTokens: 256,
  overlapTokens: 40,
};

/**
 * Estimate a token count for a string. We do not ship a full BPE tokenizer for
 * an offline heuristic; the classic ~4-characters-per-token rule is close enough
 * to keep chunks comfortably under the embedding model's limit, and it is
 * deterministic (so tests are stable). Empty/whitespace text is 0 tokens.
 */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

/** Split text into paragraphs on blank lines, dropping empties. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Split a paragraph into sentences (keeps terminal punctuation). */
function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Hard-split an over-long unit into word runs each within `maxTokens`. */
function splitByWords(unit: string, maxTokens: number): string[] {
  const words = unit.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (estimateTokens(cur.join(" ")) >= maxTokens) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/**
 * Break text into a flat list of "units" no larger than `targetTokens`:
 * paragraphs first, splitting any over-long paragraph into sentences, and any
 * over-long sentence into word runs. Every returned unit fits within the target.
 */
function toUnits(text: string, targetTokens: number): string[] {
  const units: string[] = [];
  for (const para of splitParagraphs(text)) {
    if (estimateTokens(para) <= targetTokens) {
      units.push(para);
      continue;
    }
    for (const sentence of splitSentences(para)) {
      if (estimateTokens(sentence) <= targetTokens) {
        units.push(sentence);
      } else {
        units.push(...splitByWords(sentence, targetTokens));
      }
    }
  }
  return units;
}

/** Take whole trailing units summing to ~`overlapTokens` (for chunk overlap). */
function trailingOverlap(units: string[], overlapTokens: number): string[] {
  if (overlapTokens <= 0) return [];
  const carried: string[] = [];
  let total = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const t = estimateTokens(units[i]);
    if (total + t > overlapTokens && carried.length > 0) break;
    carried.unshift(units[i]);
    total += t;
    if (total >= overlapTokens) break;
  }
  return carried;
}

/**
 * Chunk `text` into token-bounded, overlapping passages. Deterministic and
 * boundary-aware (paragraph → sentence → word). Whitespace-only input yields no
 * chunks. Overlap is never allowed to exceed the target, and a chunk always
 * makes forward progress (at least one fresh unit), so this always terminates.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const targetTokens = options.targetTokens ?? DEFAULTS.targetTokens;
  const overlapTokens = Math.min(
    options.overlapTokens ?? DEFAULTS.overlapTokens,
    Math.floor(targetTokens / 2),
  );

  const units = toUnits(text, targetTokens);
  if (units.length === 0) return [];

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    const content = current.join(" ");
    chunks.push({
      content,
      index: chunks.length,
      tokenCount: estimateTokens(content),
    });
  };

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);
    // Start a new chunk when the current one is non-empty and can't take more,
    // carrying a small overlap so the boundary idea stays intact.
    if (current.length > 0 && currentTokens + unitTokens > targetTokens) {
      flush();
      const overlap = trailingOverlap(current, overlapTokens);
      current = [...overlap];
      currentTokens = overlap.reduce((n, u) => n + estimateTokens(u), 0);
    }
    current.push(unit);
    currentTokens += unitTokens;
  }
  flush();

  return chunks;
}
