/**
 * AUTHORED LESSON — "Retrieval-augmented generation — grounding the model".
 *
 * Depth target 2 (mechanistic intuition). Follows the showcase structure and
 * the four-question framing (what is it / why it works / why it's impressive /
 * how you'd use or evaluate it). Directly builds on `tokens-embeddings`
 * (embeddings + cosine similarity) and connects forward to `evaluation`
 * (recall@k / precision@k).
 */
import type { AuthoredLesson } from "../types";

export const ragLesson: AuthoredLesson = {
  topicSlug: "rag",
  title: "Retrieval-augmented generation — grounding the model",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Describe the RAG pipeline end to end: chunk → embed → index (ANN) → embed the query → retrieve top-k by cosine → condition the prompt on the retrieved context.",
    "Explain how grounding generation in retrieved evidence reduces hallucination and unlocks citations, fresh/private data, and smaller models.",
    "Run a small retrieval by cosine similarity: rank chunks, pick top-k, and recognise when the relevant chunk is missed.",
    "Diagnose common failure modes (retrieval miss, bad chunking, semantic mismatch, distractor context, stale index) and name the metrics — recall@k, precision@k — that measure them.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "The model doesn't know your docs",
        markdown: `You ask a chatbot *"what's our refund window?"* and it answers **"30 days"** —
confidently, and completely made up, because your policy actually says 14. The
model's weights were frozen months before your company existed; it has never
seen your handbook, your codebase, or last night's incident report. It can only
recite what got baked into its parameters during pretraining, and when it
doesn't know it will often **guess in fluent, plausible prose**. That is
hallucination, and no amount of prompting fully removes it.

**Retrieval-augmented generation (RAG)** is the standard fix, and it is
disarmingly simple: *before* the model answers, go fetch the relevant text from
an external store and paste it into the prompt. Now the model isn't recalling
from memory — it's **reading from evidence you handed it**, and it can cite
exactly where the answer came from. RAG is the backbone of nearly every
production LLM app that answers questions over private, fresh, or large corpora.

We'll follow the same four questions you use for every atlas topic:

1. **What is it?** — the embed → index → retrieve → condition pipeline, concretely.
2. **Why does it work?** — why grounding in retrieved text beats parametric memory.
3. **Why is it impressive?** — what editable-knowledge-as-data buys you.
4. **How would you use or evaluate it?** — the failure modes, and how you measure retrieval quality.

This lesson is the direct payoff of \`tokens-embeddings\`: RAG is embeddings and
cosine similarity put to work. If "meaning as distance" isn't solid yet, revisit
that lesson first — everything here rides on it.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — a search engine bolted onto a prompt",
        markdown: `RAG has two phases: an **offline indexing** phase you run once (and refresh as
your data changes), and an **online query** phase that runs on every request.

**Indexing (build the knowledge store).**

- **Chunk.** Split each document into passages — say a few hundred tokens each,
  often with a little overlap so an idea isn't sliced in half at a boundary. The
  chunk is the atomic unit of retrieval: you retrieve *chunks*, not documents.
- **Embed.** Run each chunk through an embedding model to get one dense vector
  (the same machinery as \`tokens-embeddings\`, but for a whole passage). Semantically
  similar passages land near each other in vector space.
- **Index.** Store those vectors in a **vector index**. At scale you don't compare
  the query against every chunk — you use **approximate nearest-neighbour (ANN)**
  search (e.g. an **HNSW** graph) to find the closest vectors in sub-linear time,
  ranked by **cosine similarity**.

**Query (answer a question).**

- **Embed the query.** Turn the user's question into a vector with the *same*
  embedding model.
- **Retrieve.** Ask the index for the **top-k** nearest chunks (k is small — 3 to
  8 is typical).
- **Condition.** Assemble a prompt that puts those retrieved chunks in as
  **context**, followed by the question and an instruction like *"answer using only
  the context above, and cite the source."* The frozen LLM now generates an answer
  **grounded** in text you supplied.

Nothing about the model's weights changes — RAG is entirely a **prompt-construction**
technique. You are, in effect, giving the model an open-book exam and choosing
which pages it gets to see.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "The RAG pipeline — index offline, retrieve and condition online",
        diagram: `flowchart TD
  A["documents"] --> B["chunk into passages"]
  B --> C["embed each chunk"]
  C --> D["vector index<br/>ANN / HNSW, cosine"]
  Q["user query"] --> E["embed query<br/>(same model)"]
  E --> F["retrieve top-k<br/>nearest chunks"]
  D --> F
  F --> G["prompt =<br/>context chunks + question"]
  G --> H["frozen LLM"]
  H --> I["grounded answer<br/>with citations"]`,
        caption:
          "Left/top: documents are chunked, embedded, and stored in a vector index — done offline. Bottom: the query is embedded with the same model, the index returns the top-k nearest chunks by cosine similarity, and those chunks are pasted into the prompt as context. The LLM's weights never change; RAG only controls what text the model gets to read.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — knowledge in the store, not the weights",
        markdown: `A frozen model has to cram everything it knows into its parameters, and its
"memory" is lossy: it interpolates, blurs details, and confidently fills gaps. A
specific fact — *your* refund window, a version number, a name — is exactly the
kind of thing parametric memory gets wrong. RAG changes **where the knowledge
lives**: out of the weights and into a store you can query, edit, and audit.

Three mechanisms make this pay off:

- **Grounding reduces hallucination.** When the answer must be supported by
  provided text, the model's job shifts from *recall* ("what do I remember?") to
  *reading comprehension* ("what does this passage say?"), which it is far better
  at. The evidence is right there in the context window, so the correct answer is
  the *easy* continuation — and you can instruct it to say "not in the context"
  rather than invent.
- **Knowledge becomes updatable without retraining.** Add a document, re-embed a
  chunk, delete a stale one — the model sees the change on the very next query. No
  fine-tune, no retrain, no waiting for the next base model.
- **Retrieval finds meaning, not keywords.** Because chunks and queries live in the
  same learned embedding space, *"how do I get my money back"* retrieves a passage
  titled *"Refund policy"* even with **zero words in common** — cosine similarity is
  high because the vectors point the same way. This is the "meaning as geometry"
  result from \`tokens-embeddings\`, applied to whole passages.

The catch, and the theme of the rest of this lesson: **retrieval quality caps
answer quality.** If the right chunk isn't in the top-k you hand the model, no
prompt phrasing can save you. Garbage in, garbage out.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — one retrieval, and one that misses",
        markdown: `Query: **"How do I get a refund?"** We have four chunks in the index. Using toy
4-dimensional embeddings (real ones have hundreds to thousands of dims, but the
mechanics are identical), retrieve by cosine similarity:

\`\`\`
cos(u, v) = (u · v) / (|u| |v|)
\`\`\`

**Part A — a healthy retrieval.**

\`\`\`
query q = [0.90, 0.40, 0.20, 0.10]      |q| ≈ 1.010

c1  "Refund policy: refunds within 14 days..."  = [0.88, 0.30, 0.25, 0.10]
c2  "Return shipping instructions..."           = [0.50, 0.80, 0.30, 0.10]
c3  "Payment methods we accept..."              = [0.30, 0.20, 0.90, 0.20]
c4  "How to cancel your subscription..."        = [0.40, 0.30, 0.20, 0.85]
\`\`\`

Computing each cosine (verify c1: q·c1 = 0.792 + 0.120 + 0.050 + 0.010 = 0.972;
|c1| ≈ 0.968; 0.972 / (1.010 × 0.968) ≈ 0.994):

| chunk | cosine to query | rank |
|-------|-----------------|------|
| **c1** refund policy | **0.99** | 1 |
| c2 return shipping | 0.84 | 2 |
| c4 cancel subscription | 0.60 | 3 |
| c3 payment methods | 0.55 | 4 |

With **top-k = 2** we retrieve **{c1, c2}**. The correct chunk c1 ranks first, so
the assembled prompt is:

\`\`\`
Use ONLY the context to answer. Cite the source. If the answer
isn't in the context, say you don't know.

[1] Refund policy: refunds within 14 days of delivery...
[2] Return shipping instructions: to send an item back...

Question: How do I get a refund?
\`\`\`

The model answers **"within 14 days, per [1]"** — grounded, cited, correct.

**Part B — a retrieval MISS from bad chunking.**

Now suppose the refund sentence got chunked badly: it was swept into a chunk
dominated by unrelated legal footer boilerplate, so its embedding drifts away
from the query's direction:

\`\`\`
c1' "...© 2026. Terms. Privacy. (refunds within 14 days)" = [0.20, 0.30, 0.30, 0.85]
\`\`\`

Now \`cos(q, c1') ≈ 0.45\` (q·c1' = 0.445; |c1'| ≈ 0.971). Re-ranking:

| chunk | cosine to query | rank |
|-------|-----------------|------|
| c2 return shipping | 0.84 | 1 |
| c4 cancel subscription | 0.60 | 2 |
| c3 payment methods | 0.55 | 3 |
| **c1' refund (buried)** | **0.45** | 4 |

With **top-k = 3** we retrieve **{c2, c4, c3}** — the refund answer is **rank 4 and
never reaches the model**. Given only shipping, cancellation, and payment
context, the model either honestly says *"I don't know"* or, worse, falls back on
**parametric memory and hallucinates "30 days."** The knowledge was in the store
the whole time; **bad chunking + a fixed k made it invisible.** Retrieval quality
capped the answer.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things about RAG are genuinely notable, and worth being able to defend:

- **Knowledge becomes editable data, not frozen weights.** The hardest part of an
  LLM — knowing things — moves into a store you can \`INSERT\`, \`UPDATE\`, and
  \`DELETE\` in real time. Fixing a wrong answer is a one-line edit to a chunk, not a
  multi-million-dollar retrain. Your app can answer about events from five minutes
  ago and about private data the model was never (and should never be) trained on.

- **A small model + good retrieval can beat a big model alone.** On
  knowledge-intensive questions, most of the difficulty is *having the right fact*,
  not reasoning over it. Hand a modest model the exact passage and it will often
  out-answer a far larger model relying on fuzzy memory — cheaper, faster, and more
  current. Retrieval substitutes for scale.

- **Answers become verifiable.** Because every claim traces back to a retrieved
  chunk, you can show **citations** and let a human check the source. That turns an
  unfalsifiable black-box assertion into an auditable answer — the difference
  between "trust me" and "here's the page." For anything high-stakes, that
  traceability is the whole ballgame.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain what a 'retrieval miss' is and why, when one happens, no amount of prompt engineering on the generation step can recover the correct answer.",
        rubric: `A strong answer hits: (1) a retrieval miss = the chunk that actually contains
the answer is not among the top-k chunks returned by the retriever, so it never
enters the prompt; (2) the LLM only ever sees the context it was handed, so if
the evidence isn't there the model has nothing to ground on; (3) it must then
either abstain ("I don't know") or fall back on parametric memory and
hallucinate — and better generation-side prompting can't conjure text that was
never retrieved. Bonus: names a cause (bad chunking, k too small, semantic
mismatch) and notes "retrieval quality caps answer quality / garbage in,
garbage out."`,
        explanation:
          "Generation can only work with the retrieved context. A miss is a failure upstream of the LLM, so it must be fixed with retrieval (better chunking, larger k, better embeddings, reranking), not with prompt wording.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `RAG's failure modes almost all live in **retrieval**, not generation — so that's
where you instrument and measure. The ones you'll actually hit:

- **Retrieval miss (recall failure).** The right chunk isn't in the top-k. Causes:
  k too small, a weak embedding model, or the query and answer worded too
  differently. Fix by raising k, improving embeddings, or adding a **reranker** that
  re-scores a larger candidate set.
- **Bad chunking.** Chunks split mid-idea, or are so large the relevant sentence is
  **diluted** by surrounding filler (as in Part B), or so small they're
  **fragmented** and lose context. Chunk on semantic boundaries; add overlap; tune
  size to your content.
- **Semantic mismatch.** The user asks in words nothing like the source ("dark
  mode" vs a doc that says "night theme"). Mitigate with better embedding models,
  query rewriting, or **hybrid search** (combine dense vectors with keyword/BM25).
- **Distractor context (precision failure).** Irrelevant-but-plausible chunks get
  retrieved and **mislead** the model, or bury the real evidence. More context is
  not always better — precision matters as much as recall.
- **The model ignoring or over-trusting context.** It may lean on memory even with
  good context, or parrot a retrieved passage that is itself wrong. Instruct it to
  answer *only* from context and to cite; keep the source store clean.
- **Stale index.** The source changed but you never re-embedded. Fresh data is a
  headline benefit of RAG — but only if your index actually stays fresh.

**How you evaluate it — measure retrieval separately from generation.** For the
retriever, use ground-truth query→relevant-chunk pairs and compute
**recall@k** (is the right chunk in the top-k?) and **precision@k** (how much of
the top-k is actually relevant?) — the exact intrinsic-vs-extrinsic split you met
for embeddings in \`tokens-embeddings\`, and the throughline into the \`evaluation\`
topic. If recall@k is low, no generation prompt will save you; fix retrieval
first. Then evaluate the end-to-end answer for **faithfulness** (is every claim
supported by a retrieved chunk?) and correctness.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "Your RAG bot gives answers that are fluent and well-cited, but the cited chunks frequently don't actually contain the answer — and recall@5 on your eval set is only 0.55. Where should you focus first?",
        choices: [
          "Rewrite the generation prompt to tell the model to be more accurate.",
          "Improve retrieval — better chunking, embeddings, a larger k, or a reranker — because more than half the time the right chunk never reaches the model.",
          "Switch to a larger, more capable generation model.",
          "Lower the temperature so the model hallucinates less.",
        ],
        answerIndex: 1,
        explanation:
          "recall@5 = 0.55 means the correct chunk is absent from the top-5 nearly half the time. That is an upstream retrieval failure; the generation model literally never sees the evidence, so prompt tweaks, a bigger model, or temperature changes can't fix it. Retrieval quality caps answer quality.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — build a tiny RAG and break it on purpose (30–40 min)",
        markdown: `Build the smallest possible RAG over a handful of documents and watch a
retrieval miss happen, so the failure modes stop being abstract.

1. **Index.** Take 10–20 short passages (your own notes, a doc's paragraphs).
   Embed each with any embeddings API or a small local model. Store the vectors
   in a list — at this scale you don't need a real vector DB.

2. **Retrieve.** For a handful of test questions, embed the query, compute cosine
   similarity against every chunk, sort, and print the top-k with scores.

   \`\`\`python
   import numpy as np
   def cosine(a, b):
       return (a @ b) / (np.linalg.norm(a) * np.linalg.norm(b))

   scored = sorted(
       ((cosine(q_vec, c_vec), text) for c_vec, text in chunks),
       reverse=True,
   )
   for score, text in scored[:k]:
       print(round(score, 3), text[:80])
   \`\`\`

3. **Condition.** Paste the top-k chunks into a prompt with *"answer using only
   the context; cite the chunk number; say 'not found' if it isn't there,"* and
   generate an answer.

4. **Break it deliberately.** (a) Set \`k = 1\` and find a question where the right
   answer is at rank 2 → watch it get missed. (b) Merge two unrelated passages
   into one giant chunk and re-embed → watch the diluted chunk's score drop. (c)
   Ask a question using synonyms that don't appear in the source → watch semantic
   mismatch push the score down.

5. **Measure.** Hand-label the correct chunk for ~8 questions and compute
   **recall@k** (fraction where the correct chunk is in the top-k) for k = 1, 3, 5.

**Deliverable:** a short note (6–8 sentences) reporting your recall@k for a couple
of k values, one concrete retrieval miss you triggered (which failure mode, and
the fix that resolved it), and one sentence on what k you'd ship and why.`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "Lewis et al. — Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (2020)",
        url: "https://arxiv.org/abs/2005.11401",
        author: "Patrick Lewis et al. (Facebook AI Research)",
        note: "The paper that named RAG: couples a neural retriever over a dense index with a seq2seq generator, and shows grounding on retrieved passages improves knowledge-intensive tasks and reduces hallucination.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "Pinecone — Retrieval Augmented Generation (learn guide)",
        url: "https://www.pinecone.io/learn/retrieval-augmented-generation/",
        author: "Pinecone",
        note: "A practitioner walkthrough of the chunk → embed → index → retrieve → condition pipeline, with concrete guidance on chunking, top-k, and the retrieval failure modes covered above.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Retrieval-augmented generation — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "Which best describes what RAG changes about how a model answers a question?",
        choices: [
          "It fine-tunes the model's weights on your documents so the knowledge is memorised.",
          "It retrieves relevant text from an external store and puts it into the prompt as context, so the model answers from provided evidence rather than from its frozen weights.",
          "It increases the model's context window so more of its training data fits.",
          "It re-ranks the model's output tokens using cosine similarity to your documents.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "At query time, in what order do the core RAG steps happen?",
        choices: [
          "Embed the query → retrieve top-k nearest chunks by cosine → put chunks in the prompt → generate a grounded answer.",
          "Chunk the query → fine-tune the model → generate → embed the answer.",
          "Generate a draft answer → retrieve chunks that match it → embed the result → re-generate.",
          "Embed every document → chunk the query → rank by keyword overlap → generate.",
        ],
        answerKey: { correctIndex: 0 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "A user searches 'how do I get my money back' and the relevant chunk is titled 'Refund policy' with no words in common — yet retrieval still finds it. Why?",
        choices: [
          "The retriever does a keyword match after stemming 'money' to 'refund'.",
          "The query and the chunk are embedded into the same vector space, and their vectors point in nearly the same direction, so cosine similarity is high despite zero shared words.",
          "The model already memorised the refund policy during pretraining.",
          "The chunk was manually tagged with the keyword 'money back'.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "A teammate says 'our RAG bot still hallucinates, so let's just use a bigger, smarter generation model.' Explain why that may not help, walking through where hallucinations most often originate in a RAG system and how you would diagnose and fix the real problem.",
        answerKey: {
          criteria: [
            {
              id: "locus",
              description:
                "Identifies that in RAG most hallucinations originate upstream in RETRIEVAL — the right chunk is missing from the top-k (retrieval miss) or is drowned out by distractors — so the generation model never receives the needed evidence and a bigger model can't fix a missing input.",
              points: 3,
            },
            {
              id: "measure",
              description:
                "Proposes diagnosing retrieval separately from generation, e.g. building ground-truth query→chunk pairs and computing recall@k / precision@k to see whether the correct chunk is actually being retrieved before blaming the generator.",
              points: 3,
            },
            {
              id: "fix",
              description:
                "Names concrete retrieval-side fixes tied to failure modes — better chunking, better/larger-k retrieval, improved embeddings, reranking, or hybrid search — plus grounding instructions (answer only from context, cite, allow 'I don't know').",
              points: 2,
            },
          ],
          guidance:
            "Full marks require locating hallucinations in retrieval (not just generation) AND proposing to measure retrieval (recall@k / precision@k) before switching models. Naming specific retrieval fixes earns the last points. A big-model swap alone, with no retrieval diagnosis, is the misconception the question targets.",
        },
        points: 8,
      },
    ],
  },
};
