# atlas

A private, single-user web app that teaches how large language models actually
work, then makes you prove you learned it before it moves on.

The curriculum is a ten-topic spine that runs from **tokens & embeddings** up to
**retrieval-augmented generation**. Each topic is a lesson, a quiz, and a
mastery gate. Pass the gate and the next topic unlocks. Everything you pass gets
scheduled for spaced-repetition review so it sticks. The app that teaches how
LLMs work is itself built on one: a strict AI grader marks your free-text
answers, and a retrieval tutor answers follow-up questions using only atlas's
own lessons.

Built for one learner (the author), but engineered like it has to survive a code
review: a deterministic core with no model in it, a grader that cannot see who
it is grading, and an eval gate that has to pass before the grading model can be
swapped.

## Heres some screenshots of it in action:
<img width="1341.9" height="676.9" alt="Screenshot 2026-07-19 211735" src="https://github.com/user-attachments/assets/3195a644-4a18-4aed-abb5-24d9989a8a9f" />
<img width="1341.9" height="837.9" alt="Screenshot 2026-07-19 211756" src="https://github.com/user-attachments/assets/38ab3ba2-e933-4d7c-bac3-41263d13baae" />
<img width="1033.2" height="515.2" alt="Screenshot 2026-07-19 211808" src="https://github.com/user-attachments/assets/1d76884e-a072-4072-97e9-84a8b0988441" />
<img width="288.5" height="371" alt="Screenshot 2026-07-19 212007" src="https://github.com/user-attachments/assets/eba4f988-d919-4b55-b877-5751676c6aed" />


## The learning loop

```
intake → dashboard → lesson → quiz → strict grade → mastery gate → unlock
                         ↑                                            │
                         └─────────── spaced-repetition review ←──────┘
```

- **`/intake`** places you with a short questionnaire and seeds initial mastery,
  so you skip what you already know.
- **`/`** is the dashboard: the topic spine with per-topic status
  (locked / available / mastered) and the single next action.
- **`/lesson/[id]`** is the lesson viewer: long-form prose, a rendered Mermaid
  diagram, a worked example, inline recall checks, citations, and an
  "Ask about this topic" tutor grounded in the lesson corpus.
- **`/lesson/[id]/quiz`** grades multiple-choice deterministically and hands the
  free-text answer to the strict grader. Score 80% or better and the mastery
  gate records mastery, unlocks the next topic, and seeds review cards.
- **`/review`** surfaces the cards that are due, grades them with the same
  machinery as the quiz, and reschedules each one with FSRS-5.

## Notable engineering

**Grading is identity-blind by design.** The grader is a separate persona from
any teaching or encouraging voice, and it never sees the learner's name, streak,
or history. It gets the question, the rubric, and the answer text, and nothing
else. That contract is the only shape the grader can be handed
(`GradeFreeTextInput` in `lib/ai/grader-prompt.ts`), so it is a pure module and
the anti-sycophancy invariant is unit-tested. The model cannot go easy on you
because you are on a streak, because it has no idea you are.

**A golden-set eval gates any change to the grading model.** atlas grades on a
cheap DeepSeek model instead of a frontier one. The risk in that trade is a
cheaper model that over-credits vague-but-plausible answers, which would quietly
defeat the whole point. So `npm run eval:grader` runs labelled fixtures spanning
correct, partial, vague-trap, wrong, off-topic, and empty answers, each with an
expected score band, and exits non-zero if the model credits anything it must
deny. That is the acceptance gate for swapping the grader model, and the eval
math is itself unit-tested.

**The deterministic core has no AI in it.** Multiple-choice grading, mastery
math, the gate/unlock rules, FSRS-5 scheduling, and placement all live in
`lib/learning/` as pure functions, unit-tested with no database and no API key.
The model is only called where real judgment is needed: grading free text and
answering tutor questions. Everything mechanical stays mechanical, and testable.

**The tutor can only cite atlas's own lessons.** "Ask about this topic" embeds
your question, retrieves the closest chunks of the app's own authored lessons
over pgvector (top-k cosine on an HNSW index), and answers grounded only in what
it retrieved, citing the lessons it used. When nothing relevant comes back it
returns an honest "not covered" answer without calling the model at all
(`lib/ai/tutor-prompt.ts`). It indexes only atlas's own teaching text, never
external content.

**Fail-closed auth.** One password, stored only as a scrypt hash, sealed in an
encrypted iron-session cookie, behind a deny-by-default request gate
(`proxy.ts`). If `SESSION_SECRET` or `DASHBOARD_PASSWORD_HASH` is missing, the
app stays locked. That is intentional, not a bug to patch with a fallback.

**Content is data, seeded offline.** Lessons and quizzes are hand-authored typed
modules in `lib/content/`. Nothing calls a model at author or build time; the
seed is idempotent and upgrades lessons in place. A content test enforces that
every topic in the spine stays masterable (published, with content blocks and a
gradeable assessment) so the curriculum can never ship a dead end. The build and
the deterministic tests run with zero infrastructure and zero API keys.

**AI providers are a thin, swappable seam.** `lib/ai/` wraps the Vercel AI SDK
over two "strong" and "cheap" slots and calls DeepSeek's API directly, no
gateway. Embeddings are a second direct provider (OpenAI `text-embedding-3-small`,
1536 dims, matched to a fixed `vector(1536)` column). Every provider is
fail-closed: a missing key throws a clear error only when that slot is actually
asked for. The "strong" slot has no live provider yet, so asking for it fails
with a deliberate seam error instead of silently calling a dead endpoint.

## Stack

- **Next.js 16** (App Router) · TypeScript · React 19 · **Tailwind CSS v4** · ESLint
- **Neon Postgres** via **Drizzle ORM** (drizzle-kit migrations, Neon serverless driver)
- **pgvector** for retrieval (HNSW, `vector_cosine_ops`)
- **DeepSeek** (chat, via `@ai-sdk/deepseek`) and **OpenAI** (embeddings), both called directly
- **iron-session** for the encrypted auth cookie

> **Next 16 note:** `middleware.ts` was renamed to **`proxy.ts`** in Next 16, and
> it defaults to the Node.js runtime. In this app `proxy.ts` **is** the auth gate.

## Running it locally

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npm run dev                    # http://localhost:3000
```

The app is **locked** until `SESSION_SECRET` and `DASHBOARD_PASSWORD_HASH` are
set. That is the fail-closed behavior, not a misconfiguration.

### Generate the password hash

The password is never stored in plaintext, only a scrypt hash. Generate one:

```bash
npm run hash-password
# type your password at the prompt, then copy the printed line into .env.local:
# DASHBOARD_PASSWORD_HASH="scrypt$16384$8$1$...."
```

`npm run hash-password` runs `node scripts/hash-password.mjs`. It reads the
password interactively so it never lands in your shell history. You can also pipe
it: `printf '%s' 'pw' | node scripts/hash-password.mjs`.

### Generate a session secret

```bash
openssl rand -base64 48   # paste into SESSION_SECRET (must be >= 32 chars)
```

## Environment variables

See [`.env.example`](./.env.example) for the annotated list. Summary:

| Variable                  | Required   | Purpose                                                        |
| ------------------------- | ---------- | -------------------------------------------------------------- |
| `SESSION_SECRET`          | yes (gate) | Encrypts and signs the session cookie. **>= 32 chars.**        |
| `DASHBOARD_PASSWORD_HASH` | yes (gate) | scrypt hash of the login password. Never plaintext.            |
| `DATABASE_URL`            | runtime    | Neon Postgres connection string. Needed by `db:seed`, `db:ingest`, and every DB-backed page. |
| `DEEPSEEK_API_KEY`        | runtime\*  | Direct DeepSeek key for `lib/ai`. Needed to grade a free-text quiz answer, generate the tutor's answer, and run `npm run eval:grader`. Fail-closed when unset. |
| `OPENAI_API_KEY`          | runtime\*  | Direct OpenAI key for `lib/ai/embeddings`. Embeddings only (`text-embedding-3-small`, 1536 dims). Needed by `npm run db:ingest` and the tutor's query step. Fail-closed when unset. |
| `AI_CHEAP_MODEL`          | no         | Override the cheap grader/tutor slot (`deepseek-v4-flash` \| `deepseek-v4-pro`). |
| `AI_STRONG_MODEL`         | no         | Override the strong slot id (no live provider yet). |

## Database

The full schema lives in [`lib/db/schema.ts`](./lib/db/schema.ts) (19 tables,
including ones that stay empty until later work). Generate migration SQL from it:

```bash
npm run db:generate        # emits drizzle/*.sql (no DB connection needed)
```

`drizzle/0000_init.sql` enables the **pgvector** extension as its **first
statement** (`CREATE EXTENSION IF NOT EXISTS vector;`) so that
`source_chunk.embedding vector(1536)` and its HNSW (`vector_cosine_ops`) index
can be created. If you ever delete `drizzle/` and regenerate, **re-add that line
by hand**: drizzle-kit does not emit `CREATE EXTENSION` on its own.

Applying migrations (`npm run db:migrate` / `db:push`) needs a live
`DATABASE_URL` and is done by the owner after provisioning Neon.

### Seed the curriculum

Content is authored offline (typed modules in `lib/content/`) and inserted by the
seed, with no live curriculum or lesson generation. After migrating:

```bash
npm run db:seed    # needs DATABASE_URL; no API key. Idempotent, safe to re-run.
```

This inserts the full ten-topic spine (all lessons authored, quizzes included)
and a single-user learner that owns the curriculum. Re-running upgrades lessons
in place. First visit then routes you through `/intake` before the dashboard.

### Ingest the retrieval corpus

atlas indexes its own authored lessons into `source` / `source_chunk` so the
"Ask about this topic" tutor can answer grounded in that material, and only that
material. After seeding:

```bash
npm run db:ingest   # needs DATABASE_URL + OPENAI_API_KEY. Idempotent, re-embeds in place.
```

This chunks each published lesson's teaching text, embeds each chunk with OpenAI
`text-embedding-3-small` (1536 dims, matching the `vector(1536)` column), and
writes the vectors. Retrieval (`lib/rag/retrieve.ts`) then does top-k cosine
search over the HNSW index. The chunking, ranking, and grounded-answer logic are
unit-tested without a DB or key (`test/rag.test.ts`).

## Tests

```bash
npm test    # node --test; auth gate, learning-loop logic (grading, mastery,
            # gate/unlock, FSRS-5, placement), RAG chunking/ranking/grounding,
            # AI provider routing, grader identity-blindness, and eval math.
            # No DB or API key required.
```

### The grader eval

Because grading runs on a cheap DeepSeek model, a **golden-set eval** guards that
it still grades as strictly as a frontier model would. Fixtures live in
[`test/grader-eval/`](./test/grader-eval/): labelled answers spanning correct,
partial, vague-trap, wrong, off-topic, and empty, each with an expected score
band. The eval math and the identity-blind contract are covered by `npm test`.
The **live** run exercises the real cheap-slot model:

```bash
DEEPSEEK_API_KEY=... npm run eval:grader
# override the model under test:
AI_CHEAP_MODEL=deepseek-reasoner DEEPSEEK_API_KEY=... npm run eval:grader
```

It exits non-zero if the model over-credits any must-deny fixture or returns
invalid structured output. That is the acceptance gate for swapping the grader
model, and it needs the DeepSeek credential, so it is not part of `npm test`.

## What runs without infrastructure

`npm run build`, `npm run lint`, and `npm test` all run with no database and no
keys, along with the whole `lib/learning` and `lib/rag` pure logic. A live
`DATABASE_URL` is needed for `db:seed`, `db:ingest`, and every DB-backed page. A
DeepSeek key adds the free-text grade, the tutor's answer, and `eval:grader`. An
OpenAI key adds `db:ingest` and the tutor's query embedding.

## Repo map

| Path              | What lives there                                               |
| ----------------- | -------------------------------------------------------------- |
| `app/`            | App Router pages and server actions (intake, dashboard, lesson, quiz, review, login) |
| `lib/learning/`   | Deterministic core: MCQ grading, mastery, gate/unlock, FSRS-5, placement |
| `lib/ai/`         | Provider seam, strict grader, grounded tutor, embeddings       |
| `lib/rag/`        | Chunking, embedding ingest, retrieval, cosine ranking          |
| `lib/content/`    | Hand-authored lessons, quizzes, and the topic spine            |
| `lib/db/`         | Drizzle schema, lazy client, queries                           |
| `test/`           | `node --test` suites plus the grader-eval fixtures             |

## Deployment

Target is **Vercel** (Node runtime) with **Neon Postgres** for the database.
Environment variables (see `.env.example`) are set on the Vercel project; Neon
is provisioned separately and its connection string supplied via `DATABASE_URL`.

A custom domain can be attached with a single CNAME record pointing at Vercel's
DNS target:

| Type  | Name (host) | Value / Target         | Proxy        |
| ----- | ----------- | ---------------------- | ------------ |
| CNAME | `<subdomain>` | `cname.vercel-dns.com` | **DNS only** |

If the DNS provider offers a proxy (e.g. Cloudflare's orange cloud), it must be
**off** (DNS only) so Vercel can provision the TLS certificate and serve
directly. Once the record propagates, Vercel auto-issues the certificate and the
domain serves atlas over HTTPS, landing on the login page (the app is
deny-by-default via `proxy.ts`).
