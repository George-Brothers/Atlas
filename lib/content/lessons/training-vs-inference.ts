/**
 * "Training vs inference — two regimes."
 *
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it. Authored to the reference bar set by `tokens-embeddings.ts`.
 *
 * The content lives here as typed `AuthoredBlock[]` + an `AuthoredAssessment`
 * so it is schema-checked at build time and inserted verbatim by the seed.
 */
import type { AuthoredLesson } from "../types";

export const trainingVsInferenceLesson: AuthoredLesson = {
  topicSlug: "training-vs-inference",
  title: "Training vs inference — two regimes, one set of weights",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Contrast teacher-forced parallel training with autoregressive, sequential generation — same weights, two regimes.",
    "Explain the KV cache: what it stores, why prior keys/values never change, and how it turns O(n²) work into O(n).",
    "Predict how temperature and top-p reshape the next-token distribution, and reason about the diversity/quality tradeoff.",
    "Explain exposure bias — why teacher forcing means the model never trains on its own mistakes — and its consequence at inference.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "The same network, running two completely different ways",
        markdown: `Here is a fact that surprises almost everyone: the model that *learned* to
write and the model that *serves* your request are the exact same weights — but
they run in two regimes so different that one is massively parallel and the
other is stubbornly one-token-at-a-time.

When a language model **trains**, it already has the whole target sentence in
front of it. It can score its prediction at *every* position at once, in a
single forward pass. When that same model **generates**, it has nothing ahead
of it — it must produce one token, glue it onto the end, feed the longer string
back in, and predict again. Training is a photo of the finished sentence;
generation is writing it left to right with no eraser.

This lesson opens that split. We follow the same four questions you'll reuse for
every topic in atlas:

1. **What is it?** — the two regimes: teacher-forced parallel training vs
   autoregressive sequential generation.
2. **Why does it work?** — causal masking lets one pass supervise every
   position; the KV cache lets generation avoid redoing work.
3. **Why is it impressive?** — quadratic waste becomes linear cost, and two
   scalar knobs trade determinism for creativity with **zero** retraining.
4. **How would you use or evaluate it?** — setting temperature and top-p,
   sizing the KV cache, and knowing where exposure bias bites.

This builds directly on the causal masking you met in \`transformers-gpt\`, and
the thing being sampled is the next-token distribution from
\`language-modeling\`.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — teacher forcing vs autoregression",
        markdown: `A language model is trained on one objective: given a prefix, predict the next
token. The subtlety is *what prefix it conditions on*, and that is where the two
regimes diverge.

**Training uses teacher forcing.** The whole target sequence is known up front,
so the model is always fed the **ground-truth** prefix, never its own guesses.
For the sentence \`the cat sat\`, position 1 predicts \`cat\` given \`the\`,
position 2 predicts \`sat\` given \`the cat\` — and the "\`the cat\`" it sees is
the real data, not whatever it would have generated. Because a **causal mask**
stops every position from peeking at tokens to its right, all of these
predictions are independent and can be computed **in parallel in one forward
pass**. One pass over a length-\`n\` sequence yields \`n\` supervised next-token
predictions at once. This parallelism is *the* reason transformers train so
efficiently.

**Inference is autoregressive.** Now there is no ground truth to feed. The model
must generate: predict a token, **sample** one from the resulting distribution,
**append** it, and feed the extended sequence back in to predict the next. Each
step depends on the output of the previous one, so generation is inherently
**sequential** — you cannot compute token 50 before you know token 49. The
weights are identical; only the data flow changed. Training rides on a prefix it
is handed; generation rides on the prefix it is *building*.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "Two regimes: parallel teacher-forced training vs sequential cached generation",
        diagram: `flowchart TD
  subgraph TRAIN["TRAINING — one parallel pass (teacher forcing)"]
    direction LR
    T0["full target known<br/>&quot;the cat sat&quot;"] --> T1["one forward pass<br/>+ causal mask"]
    T1 --> T2["predict next token<br/>at ALL positions<br/>at once"]
    T2 --> T3["loss vs ground-truth<br/>prefix (not own output)"]
  end
  subgraph GEN["INFERENCE — autoregressive loop (KV cache)"]
    direction LR
    G1["predict next-token<br/>distribution"] --> G2["sample<br/>(temperature, top-p)"]
    G2 --> G3["append token<br/>cache its K,V"]
    G3 --> G1
  end`,
        caption:
          "Left/top: with the whole target in hand, a causal mask lets one forward pass supervise every position simultaneously — the model always conditions on the ground-truth prefix (teacher forcing). Right/bottom: generation has no future to look at, so it loops one token at a time, sampling from the distribution and caching each new token's keys and values so prior work is never recomputed.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — causal masking parallelises training, the KV cache rescues generation",
        markdown: `**Why one pass can supervise every position.** In self-attention each token
builds a query and attends to keys/values. The **causal mask** sets attention to
all *future* positions to \`-∞\` before the softmax, so position \`i\` can only see
tokens \`≤ i\`. That means position \`i\`'s prediction never depends on the true
answer at position \`i\` or beyond — so you can safely compute the loss at all
positions from a single pass over the real sequence. Parallelism during training
is not a trick bolted on; it falls straight out of the mask.

**Why generation would be catastrophically slow without help.** Naively, to
produce token \`n\` you would run the full network over all \`n\` tokens. Do that
for every step and you re-process the entire prefix again and again — the total
work grows like \`O(n²)\`, and you are recomputing the attention keys and values
for tokens that have not changed since the last step.

**The key observation: prior keys and values are frozen.** Once token 7 has been
generated, its key and value vectors at every layer are fixed forever — nothing
to its right can alter them (that is exactly what the causal mask guarantees).
So there is no reason to recompute them. The **KV cache** stores the key and
value vectors of every past token. At each new step you compute Q, K, V for
**only the one new token**, append its K and V to the cache, and let its query
attend over the cached keys/values. Each step is now \`O(n)\` instead of
reprocessing everything, and the whole generation is roughly linear per token
rather than quadratic overall. This is the single biggest inference
optimisation. Its cost is **memory**: the cache grows with sequence length (and
with layers, heads, and batch size), which is why long contexts and large batches
are so memory-hungry to serve.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — how temperature reshapes the next-token distribution",
        markdown: `Sampling starts from the model's raw output scores — the **logits** — for the
next token. Suppose over three candidate tokens \`A\`, \`B\`, \`C\` the logits are:

\`\`\`
logits = [2.0, 1.0, 0.0]   # for A, B, C
\`\`\`

**Temperature** \`T\` divides the logits before the softmax: \`softmax(logits / T)\`.
Let's compute the distribution at three temperatures. (softmax of \`z\` is
\`exp(z_i) / Σ exp(z_j)\`.)

**T = 1.0** — the model's own distribution. Divide by 1 (no change):

| token | logit | exp(logit) | probability |
|-------|-------|-----------|-------------|
| A | 2.0 | 7.389 | 7.389 / 11.107 = **0.665** |
| B | 1.0 | 2.718 | 2.718 / 11.107 = **0.245** |
| C | 0.0 | 1.000 | 1.000 / 11.107 = **0.090** |

Sum of exps = 7.389 + 2.718 + 1.000 = 11.107.

**T = 0.5** — sharpen. Dividing logits by 0.5 **doubles** them to \`[4, 2, 0]\`:

| token | logit/T | exp | probability |
|-------|---------|-----|-------------|
| A | 4.0 | 54.598 | 54.598 / 62.987 = **0.867** |
| B | 2.0 | 7.389 | 7.389 / 62.987 = **0.117** |
| C | 0.0 | 1.000 | 1.000 / 62.987 = **0.016** |

Sum = 54.598 + 7.389 + 1.000 = 62.987. The top token's mass jumps 0.665 → 0.867;
the distribution is **peakier** and more deterministic.

**T = 2.0** — flatten. Dividing logits by 2 **halves** them to \`[1, 0.5, 0]\`:

| token | logit/T | exp | probability |
|-------|---------|-----|-------------|
| A | 1.0 | 2.718 | 2.718 / 5.367 = **0.506** |
| B | 0.5 | 1.649 | 1.649 / 5.367 = **0.307** |
| C | 0.0 | 1.000 | 1.000 / 5.367 = **0.186** |

Sum = 2.718 + 1.649 + 1.000 = 5.367. Now the mass is spread out — the rare token
\`C\` went from 9% to 19%; the distribution is **more random**.

The pattern is the whole point: **lower \`T\` sharpens toward the argmax** (as
\`T → 0\` you approach greedy/deterministic decoding), **higher \`T\` flattens
toward uniform** (more surprising, more error-prone). Same weights, same logits —
one scalar reshapes how adventurous the model is.

**Top-p (nucleus) sampling** is the other common knob and works differently:
sort the tokens by probability and keep the smallest set whose cumulative
probability first reaches \`p\`, then renormalise and sample only from that set.
On the \`T = 1\` distribution above, \`top-p = 0.9\` keeps A (0.665) and B (0.665 +
0.245 = 0.910 ≥ 0.9) and **drops C entirely** — you sample from just {A, B}. Top-p
adapts the candidate pool to the model's confidence: it stays small when the
model is sure and widens when it is not. (Top-k is the fixed-size cousin: always
keep the \`k\` highest-probability tokens.)`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things here are genuinely remarkable, and worth being able to articulate:

- **One network, two opposite execution modes, for free.** The very same weights
  run in a massively parallel mode for training — every position supervised in a
  single pass thanks to the causal mask — and in a cached, sequential mode for
  serving. Nobody trains a separate "generator"; the split is a consequence of
  whether the future is known, not of the model.

- **The KV cache turns quadratic waste into linear cost.** By noticing that a
  past token's keys and values can never change, generation avoids reprocessing
  the whole prefix at every step. That one observation is the difference between
  serving long contexts being merely expensive and being impossible — it is the
  optimisation that makes interactive LLMs viable at all.

- **Two scalar knobs trade determinism for creativity with zero retraining.**
  Temperature and top-p reshape the sampling distribution at inference time. The
  same model can be a precise, near-deterministic tool (low \`T\`, or greedy) or a
  brainstorming partner (higher \`T\`, wider top-p) — no new weights, no new
  training run, just a couple of numbers on the request.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain why the KV cache is possible at all — what property of causal attention guarantees that a past token's keys and values never need to be recomputed — and what you trade to get that speedup.",
        rubric: `A strong answer hits: (1) causal masking means a token can only attend to tokens
at or before its position, so nothing generated later can change an earlier
token's key/value vectors — they are frozen once produced; (2) therefore each new
step only needs to compute Q, K, V for the single new token and can reuse cached
K/V for all prior tokens, turning per-step work from reprocessing the whole
prefix (O(n²) overall) into O(n); (3) the tradeoff is memory — the cache grows
with sequence length (and layers/heads/batch), which is what makes long contexts
and big batches memory-hungry. Bonus: notes this is an inference-only concern
because training already has the whole sequence and runs in one parallel pass.`,
        explanation:
          "The causal mask freezes past keys/values, so the cache is pure reuse — you pay memory (growing with sequence length) to avoid recomputing them, converting quadratic redundant work into linear per-token cost.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `The two regimes and the sampling knobs are not trivia — they are the levers you
actually pull when you build with and evaluate models:

- **Pick decoding to match the task.** For extraction, classification, code, or
  anything where there is a right answer, use **greedy or low temperature**
  (often \`T\` near 0) so the output is stable and reproducible. For brainstorming,
  copywriting, or variety, raise \`T\` and widen **top-p** (e.g. \`T ≈ 0.8\`,
  \`top-p ≈ 0.95\`). Temperature and top-p compose — many stacks set a moderate
  \`T\` and let top-p trim the unlikely tail.

- **Know the failure modes at the extremes.** Very high \`T\` (or top-p near 1)
  invites incoherence and hallucinated tangents, because low-probability tokens
  get real mass. Very low \`T\` (or greedy) is stable but can be bland and
  **repetitive** — it may loop, which is why repetition penalties and top-p exist.

- **Reproducibility comes from decoding, not the weights.** If you need the same
  output every time (tests, audits), fix a **seed** *and* pin the decoding
  parameters — greedy is deterministic; any temperature-based sampling is not. A
  bug report that says "the model is inconsistent" is very often just sampling.

- **Budget the KV cache.** Serving cost and the practical context limit are
  driven by cache memory, which scales with **sequence length × layers × heads ×
  batch size**. Long conversations and large batches are memory-bound; this is why
  techniques like paged/quantised caches and grouped-query attention exist.

- **Exposure bias — the honest caveat.** Because teacher forcing always feeds the
  *ground-truth* prefix during training, the model never practises recovering
  from its **own** mistakes. At inference it conditions on tokens it generated,
  so a single off token can nudge the context off-distribution and errors can
  **compound** over a long generation. It is a real limitation of the
  training/inference mismatch, mitigated (not eliminated) by scale, better
  decoding, and post-training methods.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "You need a model to extract the same structured JSON from a document every single time you run it, byte-for-byte. Which decoding setup best achieves this?",
        choices: [
          "temperature = 1.0 with top-p = 0.9, because nucleus sampling removes randomness.",
          "A high temperature so the model explores more options and settles on the best one.",
          "Greedy decoding (equivalently temperature → 0), which always takes the argmax token and is deterministic.",
          "Any temperature is fine as long as you enable the KV cache, which makes generation deterministic.",
        ],
        answerIndex: 2,
        explanation:
          "Determinism comes from removing sampling: greedy / temperature → 0 always picks the highest-probability token. Top-p still samples from the surviving set, so it is not deterministic; and the KV cache is a speed optimisation that has no effect on which tokens are chosen.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — sweep temperature and top-p, and watch the KV cache (30 min, hands-on)",
        markdown: `Do this against a real API or a small local model so the behaviour becomes
muscle memory.

1. **Temperature sweep.** Send the *same* open-ended prompt (e.g. "Write one
   sentence about the ocean.") five times each at \`T = 0.0\`, \`0.7\`, and \`1.3\`,
   holding everything else fixed. Record how much the outputs vary within each
   setting.
   - Confirm \`T = 0.0\` (greedy) returns the **same** sentence every time.
   - Confirm variety and the occasional odd word climb as \`T\` rises.

2. **Top-p sweep.** Fix \`T = 1.0\` and vary \`top-p\` over \`0.5\`, \`0.9\`, \`1.0\`.
   Note where the output gets more adventurous and where it starts to wander.

3. **Reproduce the math.** In a few lines of Python, take the logits
   \`[2.0, 1.0, 0.0]\` and compute \`softmax(logits / T)\` for \`T\` in
   \`{0.5, 1.0, 2.0}\`. Check your numbers against the worked example (top token
   ≈ 0.87, 0.67, 0.51 respectively) and confirm the distribution sharpens as \`T\`
   falls.

   \`\`\`python
   import math
   def softmax_T(logits, T):
       z = [x / T for x in logits]
       m = max(z)
       exps = [math.exp(v - m) for v in z]   # stable
       s = sum(exps)
       return [e / s for e in exps]
   for T in (0.5, 1.0, 2.0):
       print(T, [round(p, 3) for p in softmax_T([2.0, 1.0, 0.0], T)])
   \`\`\`

4. **See the cache pay off (optional).** If your local runtime exposes it,
   generate a long output with the KV cache on vs off (e.g. \`use_cache=True\`
   vs \`False\` in a Hugging Face \`generate\` call) and compare wall-clock time
   and peak memory.

**Deliverable:** a short note (5–8 sentences) reporting (a) how output variety
changed across your temperature/top-p sweeps, (b) your three softmax
distributions and whether they matched the worked example, and (c) one concrete
decoding choice for a project you might build (e.g. "extraction endpoint runs
greedy for reproducibility; the ideation endpoint uses T = 0.9, top-p = 0.95").`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "Hugging Face — How to generate text: using different decoding methods",
        url: "https://huggingface.co/blog/how-to-generate",
        author: "Patrick von Platen",
        note: "The canonical practical walk-through of greedy, beam, temperature, top-k and top-p (nucleus) sampling, with runnable examples of how each reshapes generation.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "The Illustrated GPT-2 (Visualizing Transformer Language Models)",
        url: "https://jalammar.github.io/illustrated-gpt2/",
        author: "Jay Alammar",
        note: "Visual explanation of autoregressive generation and how a GPT processes tokens one at a time, including why past computation can be reused across steps (the intuition behind the KV cache).",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Training vs inference — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "During training a transformer can predict the next token at every position in a single parallel forward pass, but generation must proceed one token at a time. What is the fundamental reason for this difference?",
        choices: [
          "Training uses more GPUs than inference, so it can parallelise while inference cannot.",
          "In training the whole target sequence is known and a causal mask keeps each position from seeing the future, so all next-token predictions are independent; in generation each token must be produced before it can condition the next.",
          "The model uses different weights for training and inference, and only the training weights support parallelism.",
          "Inference disables the causal mask, which forces it to run sequentially.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "What does the KV cache store, and why is storing it valid?",
        choices: [
          "It stores the final output tokens so they can be returned faster on repeat requests.",
          "It stores each layer's query vectors, which are reused because queries do not change between steps.",
          "It stores the key and value vectors of past tokens, which are valid to reuse because causal masking means later tokens can never change an earlier token's K/V.",
          "It stores the full attention probability matrix so the softmax never has to be recomputed.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "Starting from logits `[2.0, 1.0, 0.0]`, you lower the sampling temperature from `T = 1.0` toward `T = 0`. What happens to the next-token distribution?",
        choices: [
          "It flattens toward uniform, giving the low-probability tokens more mass.",
          "It sharpens toward the highest-logit token, approaching greedy/argmax decoding as T → 0.",
          "It is unchanged, because temperature only affects top-p sampling.",
          "It inverts, making the lowest-logit token the most likely.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "Explain the difference between teacher forcing (training) and autoregressive generation (inference), and use it to explain exposure bias. Why does the training/inference mismatch cause errors to potentially compound at generation time, and how does the KV cache relate to the inference side of this picture?",
        answerKey: {
          criteria: [
            {
              id: "two-regimes",
              description:
                "Correctly contrasts the regimes: training is teacher-forced (model always conditions on the ground-truth prefix) and runs in parallel via causal masking, whereas inference is autoregressive (predict → sample → append → repeat) and is sequential because each token conditions on tokens the model itself generated.",
              points: 3,
            },
            {
              id: "exposure-bias",
              description:
                "Explains exposure bias: because teacher forcing never feeds the model its own outputs, it never practises recovering from its own mistakes, so at inference an off token pushes the context off-distribution and errors can compound over a long generation.",
              points: 3,
            },
            {
              id: "kv-cache",
              description:
                "Ties in the KV cache on the inference side: since past tokens' keys/values are frozen under causal masking, generation caches them and computes Q/K/V only for the new token, converting O(n²) recomputation into O(n) per-token work at the cost of memory that grows with sequence length.",
              points: 2,
            },
          ],
          guidance:
            "Full marks require the teacher-forcing-vs-autoregressive contrast AND a correct account of exposure bias as a consequence of that mismatch. The KV-cache point should correctly note that frozen past K/V is what makes caching valid; exact big-O notation is a bonus, not required.",
        },
        points: 8,
      },
    ],
  },
};
