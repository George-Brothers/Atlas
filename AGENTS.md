<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# atlas — project agent memory

Private, single-user AI learning web app. Committed home for durable,
project-intrinsic knowledge. Point to authoritative files instead of restating them.

## Stack (decided — build to this)

- **Next.js 16** (App Router) · TypeScript · React 19 · **Tailwind CSS v4** · ESLint.
- **Neon Postgres + Drizzle ORM**. Schema: `lib/db/schema.ts`; client (lazy,
  Neon serverless driver): `lib/db/index.ts`; config: `drizzle.config.ts`;
  migrations: `drizzle/`. `npm run db:generate` needs no DB.
- **Auth: single password, fail-closed.** `iron-session` encrypted cookie
  (HttpOnly, Secure, SameSite=Strict). Core primitives in `lib/auth.ts`
  (scrypt hash, constant-time compare, seal/unseal); server session in
  `lib/session.ts`. Password stored ONLY as a scrypt hash
  (`DASHBOARD_PASSWORD_HASH`); generate with `npm run hash-password`.
- **AI provider module `lib/ai/`**: thin, swappable wrapper over the Vercel AI
  SDK. It calls **DeepSeek's API DIRECTLY** via `@ai-sdk/deepseek` (no Vercel AI
  Gateway — the captain doesn't use it), exposing "strong"/"cheap" slots
  (`lib/ai/index.ts`). The live **cheap** slot defaults to `deepseek-v4-flash`
  (DeepSeek flash-class chat: cheap/fast/JSON-capable; `deepseek-v4-pro` is the
  other chat id). The **strong** slot has **no live provider yet** — `getModel("strong")`
  throws a clear seam error; a **direct Google/Gemini provider lands with vision**.
  Slots are overridable via `AI_CHEAP_MODEL`/`AI_STRONG_MODEL`. **Fail-closed**:
  `getModel` throws without `DEEPSEEK_API_KEY`. **Embeddings are a SECOND direct
  provider** — `lib/ai/embeddings.ts` calls **OpenAI** directly (no gateway) for
  `text-embedding-3-small` (native 1536 dims = the fixed `vector(1536)` column),
  fail-closed without `OPENAI_API_KEY`; the id is pinned (not env-overridable) so
  it can't drift off the column width. **Metered API is only for the live loop** —
  the live calls are the strict quiz grader and the grounded tutor
  (`lib/ai/tutor.ts`, cheap slot) plus the tutor's query embedding; **ingest
  embeds offline**. Curriculum + lesson content stay pre-seeded; keep API calls
  out of anything that runs at author/build time.

## Phase 1 — the core learning loop

- **Loop**: intake (`/intake`) → dashboard (`/`) → lesson (`/lesson/[id]`) →
  quiz (`/lesson/[id]/quiz`) → grade → mastery gate → unlock. Deterministic
  logic (MCQ grade, mastery math, gate/unlock, FSRS-5) lives in `lib/learning/`
  and is unit-tested (`test/learning.test.ts`) with NO DB/key. Reads go through
  `lib/db/queries.ts`; writes live with their Server Actions.
- **Review loop (M3)**: passing a quiz seeds FSRS `review_item` cards; the
  `/review` page surfaces due cards (`due_at <= now`), grades each with the SAME
  machinery as the quiz (`gradeMcq` / the strict grader — never told the
  learner's identity), then `reviewUpdate` (`lib/learning/fsrs.ts`) recomputes
  stability/difficulty + next `due_at` and writes a `review_log` row
  (`submitReview` in `app/review/actions.ts`). The dashboard shows an "N reviews
  due" CTA (`getDashboard.dueReviewCount`).
- **Retrieval + grounded tutor (M4)**: atlas indexes ONLY its OWN authored
  lessons into `source`/`source_chunk`. `scripts/ingest.ts` (`npm run db:ingest`,
  needs `DATABASE_URL` + `OPENAI_API_KEY`, run AFTER seed) flattens each
  published lesson's teaching text (`lib/rag/ingest.ts` — never mermaid source or
  external citation URLs), chunks it (`lib/rag/chunk.ts`), embeds with OpenAI
  `text-embedding-3-small`, and upserts one `source` per topic (kind="lesson",
  `source.topic_id` FK — added in `drizzle/0001`) + its chunks; idempotent
  (re-embeds in place). `retrieveTopK` (`lib/rag/retrieve.ts`) does top-k cosine
  over the HNSW index (`embedding <=> $::vector`, optionally topic-scoped). The
  **grounded tutor** ("Ask about this topic" on the lesson page → `AskTutor` +
  `askTopicTutor` action → `lib/ai/tutor.ts`) embeds the question, retrieves, and
  generates a DeepSeek answer that grounds ONLY in the retrieved chunks and cites
  their lessons — `groundedAnswer` (pure `lib/ai/tutor-prompt.ts`) short-circuits
  to an honest "not covered" WITHOUT a model call when nothing is retrieved.
  Chunking/ranking/grounding are unit-tested with no DB/key (`test/rag.test.ts`);
  the pure ranking in `lib/rag/similarity.ts` mirrors the DB's cosine order.
- **Authored content is data, seeded offline.** Lesson/quiz/spine content is
  hand-authored as typed modules in `lib/content/` and inserted by
  `scripts/seed.ts` (`npm run db:seed`, needs `DATABASE_URL`, no API key). The
  seed is idempotent and re-running UPGRADES lessons in place (topics upsert on
  slug; learner/curriculum/module/lesson get-or-create by natural key; content
  blocks + assessment backfill only when missing). All 10 spine topics are now
  authored in full; `tokens-embeddings` is the reference showcase. To add a
  lesson: author an `AuthoredLesson`, register it in `lib/content/index.ts`
  (`AUTHORED_LESSONS`), and re-seed. `test/content.test.ts` enforces that every
  spine topic stays masterable (published + blocks + gradeable assessment).
- **Grader separation is load-bearing (anti-sycophancy).** The strict grader in
  `lib/ai/grader.ts` is a SEPARATE persona from any teaching/encouraging voice
  and is NEVER told the learner's identity, streak, or history — only the
  question, rubric, and answer text. The identity-blind contract (`GRADER_SYSTEM`
  + `GradeFreeTextInput` + `buildGraderUserPrompt`) lives in the pure
  `lib/ai/grader-prompt.ts` so it is unit-testable (`test/ai-routing.test.ts`).
  Do not merge grading with an encouraging persona or pass learner context in.
  The cheaper DeepSeek model must grade AS STRICTLY as Claude did — the
  **golden-set eval** (`test/grader-eval/` fixtures + `scripts/grader-eval.ts`,
  `npm run eval:grader`, needs `DEEPSEEK_API_KEY`) is the acceptance gate for
  any grader-model swap; its pure eval math is covered by `npm test`.
- **DB-backed pages are `export const dynamic = "force-dynamic"`** (`/`,
  `/lesson/[id]`, `/lesson/[id]/quiz`) so the build never prerenders a DB query.
- **`lib/learning/*` tested modules use explicit `.ts` import extensions** and
  `tsconfig` sets `allowImportingTsExtensions` — required so `node --test` (raw
  type-stripping, no bundler) can resolve their relative imports.

## Sharp edges

- **`middleware` is `proxy` in Next 16.** The auth gate lives in `proxy.ts`
  (root), exporting `proxy()` — NOT `middleware.ts`. It defaults to the Node.js
  runtime. It is deny-by-default: everything except `/login` + static assets
  needs a valid session.
- **Fail-closed is intentional.** If `SESSION_SECRET` (>=32 chars) or
  `DASHBOARD_PASSWORD_HASH` is unset, the app stays LOCKED (login refuses). Do
  not "fix" this by adding fallbacks.
- **pgvector extension** must be enabled before `source_chunk.embedding` / its
  HNSW index. It is the first statement of `drizzle/0000_init.sql`; drizzle-kit
  will NOT re-emit `CREATE EXTENSION` if you regenerate — re-add by hand.
- **Delivery = direct-PR** (crewmate raises the PR; captain reviews/merges). No
  no-mistakes pipeline for this project.
- **PR stacking.** Phase work stacks: the Phase 1 loop PR is based on the Phase 0
  skeleton branch (`fm/atlas-skel-r7`), not `main`. Set the base accordingly and
  rebase onto `main` once the parent merges.

## Verify

- `npm run build` (must pass) · `npm run lint` (clean) · `npm test`
  (`node --test`; auth-gate + learning-logic unit tests in `test/`).
- **Needs a live `DATABASE_URL`**: `npm run db:seed`, `npm run db:ingest`, and
  every DB-backed page. **Needs a DeepSeek credential too** (`DEEPSEEK_API_KEY`):
  submitting the free-text quiz answer (the grader call), the grounded tutor
  answer, and `npm run eval:grader`. **Needs an OpenAI credential**
  (`OPENAI_API_KEY`): `npm run db:ingest` and the tutor's query embedding. The
  app builds and the deterministic tests run without any of them.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
