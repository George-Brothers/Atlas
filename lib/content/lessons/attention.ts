/**
 * Authored lesson — "Attention — letting tokens look at each other."
 *
 * Depth target 2 (mechanistic intuition). Follows the four-question framing
 * established by the showcase (`tokens-embeddings`): what is it / why it works /
 * why it's impressive / how you'd use or evaluate it.
 *
 * Content is typed `AuthoredBlock[]` + an `AuthoredAssessment` so it is
 * schema-checked at build time and inserted verbatim by the seed. This lesson
 * sits between `tokens-embeddings` (it consumes those embedding vectors) and
 * `transformers-gpt` (which assembles attention into a full block).
 */
import type { AuthoredLesson } from "../types";

export const attentionLesson: AuthoredLesson = {
  topicSlug: "attention",
  title: "Attention — letting tokens look at each other",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Define queries, keys, and values as linear projections of a token's vector, and compute a scaled dot-product attention score between two tokens.",
    "Explain softmax-weighted mixing of the value vectors and why it lets any token 'look at' any other in a single step (content-based addressing).",
    "Explain why scores are divided by sqrt(d_k) and what breaks in training without it.",
    "Contrast self-attention with recurrence and convolution on path length, parallelism, and receptive field.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "The word that has to look back",
        markdown: `Read this sentence: *"The animal didn't cross the street because **it** was too
tired."* What does *"it"* refer to — the animal, or the street? You resolved it
instantly, but notice what you had to do: you let the token *"it"* **look back**
at *"animal"*, several words away, and pull in meaning from there.

A model built only from the previous lesson's ingredients cannot do this. After
tokenization and embedding, each token is an independent vector that knows
nothing about its neighbours — *"it"* has the same embedding whether it follows
*"animal"* or *"street"*. Something has to let tokens **exchange information
based on their content**, so that the vector sitting at *"it"* can become
*"it, meaning the animal"*. That something is **attention**, and it is the
single mechanism that turned embeddings into the Transformer.

We will follow the same four questions used throughout atlas:

1. **What is it?** — queries, keys, values, and the scaled dot-product.
2. **Why does it work?** — why a softmax over dot products is a soft, learnable
   lookup that moves information from any position to any other in one step.
3. **Why is it impressive?** — constant path length, full parallelism, and one
   mechanism that learns syntax, coreference, and long-range structure from data.
4. **How would you use or evaluate it?** — the practical consequences: quadratic
   cost, the KV cache, multi-head attention, and reading attention maps.

By the end you should be able to hand-compute a tiny attention step and explain,
to a skeptical colleague, why self-attention connects *"it"* to *"animal"* in
**one hop** where an RNN would need many.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — queries, keys, and values",
        markdown: `Attention starts from the embedding vectors of the previous lesson. Every token
already sits at a vector of length \`d_model\`. From that single vector, attention
projects **three** new vectors using three learned weight matrices
(\`W_Q\`, \`W_K\`, \`W_V\`):

- a **query** \`q\` — "what am I looking for?"
- a **key** \`k\` — "what do I offer to others who are looking?"
- a **value** \`v\` — "what I will actually hand over if I'm attended to."

All three are just linear projections of the same input vector, so they are cheap
to compute and learned end-to-end. The dimensions can differ; call the
query/key size \`d_k\`.

Now the core operation. To update token \`i\`, we ask how relevant every other
token \`j\` is to it, then blend:

1. **Score** every pair with a **dot product** of \`i\`'s query against \`j\`'s
   key, divided by \` sqrt(d_k)\`:

\`\`\`
score(i, j) = (q_i · k_j) / sqrt(d_k)
\`\`\`

   A large dot product means \`q_i\` and \`k_j\` point the same way — token \`j\` is
   what token \`i\` was looking for.

2. **Normalise** the scores across all \`j\` with a **softmax**, turning them into
   non-negative **weights that sum to 1**:

\`\`\`
w_ij = softmax_j( score(i, j) )
\`\`\`

3. **Mix** the **values** with those weights. The output for token \`i\` is the
   weighted sum of everyone's value vectors:

\`\`\`
out_i = sum_j  w_ij · v_j
\`\`\`

That output vector — *"it"* now carrying a large slice of *"animal"*'s value —
replaces \`i\`'s representation going into the next stage.

When each token attends over the **same** sequence it belongs to (queries, keys,
and values all come from one input), this is **self-attention**. One more wrinkle
matters for text generation: in a language model a token must not peek at
**future** tokens, so those scores are set to \`-inf\` before the softmax —
**causal masking**. We flag it here but leave the full treatment to
\`transformers-gpt\`.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "One attention step for a single query token",
        diagram: `flowchart TD
  Qi["query q_i<br/>(from token i)"]
  K1["key k_1"]
  K2["key k_2"]
  K3["key k_3"]
  Qi --> D1["dot q_i,k_1<br/>divided by sqrt d_k"]
  K1 --> D1
  Qi --> D2["dot q_i,k_2<br/>divided by sqrt d_k"]
  K2 --> D2
  Qi --> D3["dot q_i,k_3<br/>divided by sqrt d_k"]
  K3 --> D3
  D1 --> SM["softmax over j<br/>weights sum to 1"]
  D2 --> SM
  D3 --> SM
  SM --> W["weights w_1, w_2, w_3"]
  V1["value v_1"] --> O["output = w_1 v_1 + w_2 v_2 + w_3 v_3"]
  V2["value v_2"] --> O
  V3["value v_3"] --> O
  W --> O`,
        caption:
          "For one query token i, its query is dotted against every key, scaled by 1/sqrt(d_k), and softmaxed into weights that sum to 1. The output is the weighted sum of the value vectors. Self-attention runs this for every token in parallel, with q, k, and v all projected from the same sequence.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — a soft, content-based lookup",
        markdown: `Think of attention as a **differentiable dictionary lookup**. A hard dictionary
takes a query, finds the one key that matches, and returns its value. Attention
does the *soft* version: it compares the query to **every** key, and returns a
**blend** of all the values, weighted by how well each key matched. Three design
choices make this work.

**The dot product measures relevance.** \`q_i · k_j\` is large exactly when the two
vectors point in a similar direction — the same geometry the embeddings lesson
built. So the score literally asks "does what token \`i\` wants match what token
\`j\` offers?" Because \`W_Q\` and \`W_K\` are learned, the model gets to *define*
what "relevant" means for each purpose.

**Softmax makes it soft and differentiable.** A hard \`argmax\` — "take only the
best-matching token" — has no useful gradient and forces an all-or-nothing
choice. Softmax turns the scores into a smooth probability distribution, so a
token can draw 70% from one neighbour and 30% from another, and gradients flow
back to *every* key and query to adjust the matching. This is what makes
attention **trainable**.

**A weighted average moves information anywhere in one step.** The output is just
\`sum_j w_ij v_j\`. Nothing in that sum cares about *distance* — token \`i\` can put
weight on a token 1 position away or 1,000 positions away with equal ease. This
is **content-based addressing**: you retrieve by *what you're looking for*, not by
*where it sits*. That single-hop reach is the property recurrence and convolution
lack.

**Why divide by \` sqrt(d_k)\`?** Dot products grow with dimension: add up \`d_k\`
random product terms and the sum's magnitude scales like \` sqrt(d_k)\`. For large
\`d_k\` the raw scores get big, and softmax of large-gap scores **saturates** —
almost all weight collapses onto one token and the gradient through the others
vanishes. Dividing by \` sqrt(d_k)\` keeps the scores in a sane range. Concretely,
\`softmax([2, 0]) ≈ [0.88, 0.12]\` — a healthy, learnable split — whereas
\`softmax([20, 0]) ≈ [1.0, 0.0]\` is effectively a hard, dead-gradient argmax. The
scaling keeps attention in the first regime.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — self-attention over three tokens by hand",
        markdown: `Let's compute one full attention output with clean numbers. Use \`d_k = 2\` and
three tokens. Suppose the learned projections have already produced these
queries, keys, and values (self-attention, so all come from the same sequence):

| token | query q | key k | value v |
|-------|---------|-------|---------|
| 1 | — | \`[1, 0]\` | \`[1, 0]\` |
| 2 | \`[1, 1]\` | \`[1, 1]\` | \`[0, 1]\` |
| 3 | — | \`[0, 1]\` | \`[1, 1]\` |

We update **token 2**, so its query is \`q = [1, 1]\`. (Every token gets the same
treatment in parallel; we show one.)

**1. Score** — dot \`q\` against each key, then divide by \` sqrt(d_k) = sqrt(2) ≈ 1.414\`:

\`\`\`
q · k_1 = 1*1 + 1*0 = 1      ->  1 / 1.414 = 0.707
q · k_2 = 1*1 + 1*1 = 2      ->  2 / 1.414 = 1.414
q · k_3 = 1*0 + 1*1 = 1      ->  1 / 1.414 = 0.707
\`\`\`

**2. Softmax** the scaled scores \`[0.707, 1.414, 0.707]\`:

\`\`\`
exp:  [e^0.707, e^1.414, e^0.707] = [2.028, 4.113, 2.028]
sum:  2.028 + 4.113 + 2.028 = 8.170
w:    [0.248, 0.503, 0.248]   (sums to 1.000)
\`\`\`

Token 2 attends **most to itself** (weight 0.50, the best key match) and splits
the rest evenly over its two neighbours — a clean \`[0.25, 0.50, 0.25]\`.

**3. Mix the values** with those weights:

\`\`\`
out = 0.248*[1,0] + 0.503*[0,1] + 0.248*[1,1]
    = [0.248 + 0.000 + 0.248,  0.000 + 0.503 + 0.248]
    = [0.497, 0.752]  ≈ [0.50, 0.75]
\`\`\`

That \`[0.50, 0.75]\` is token 2's new vector — a content-weighted blend of all
three values, dominated by itself but pulled toward tokens 1 and 3. Change the
query and the *same* keys and values produce a *different* blend: attention is
input-dependent routing, computed fresh for every token.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three properties are worth being able to state precisely:

- **Constant path length between any two tokens.** Any position can influence any
  other in a **single** attention step — an \`O(1)\` path, independent of how far
  apart they are. An RNN needs \`O(n)\` sequential steps to carry information across
  the sequence, and signal degrades along the way. This is *why* Transformers
  handle long-range dependencies like coreference and agreement so much better.

- **Fully parallel across positions.** Every token's query-key-value projections
  and every score are independent, so the whole layer is a couple of big matrix
  multiplications — ideal for GPUs. An RNN is inherently sequential: step \`t\`
  cannot start until step \`t-1\` finishes. Removing that sequential bottleneck is
  what let Transformers train on far more data than RNNs ever could — the practical
  breakthrough behind the architecture.

- **One mechanism, learned entirely from data.** Nobody wired *"it → animal"*.
  The *same* scaled-dot-product attention, with different learned \`W_Q\`/\`W_K\`/\`W_V\`,
  discovers syntactic agreement, coreference, and long-range topical links purely
  from the pressure of next-token prediction. Different attention heads
  specialise on different relations without ever being told the relations exist.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain why attention output is a softmax-weighted sum of the *value* vectors rather than a hard pick of the single best-matching token. What would break if you used a hard argmax instead?",
        rubric: `A strong answer hits: (1) the softmax turns the scaled query-key scores into
non-negative weights that sum to 1, and the output blends the values by those
weights, so a token can draw partly from several sources; (2) softmax is smooth
and differentiable, so gradients flow to every query and key and the matching is
learnable; (3) a hard argmax has no useful gradient (it is flat/undefined at the
switch point) and forces an all-or-nothing choice, so the model could not learn
what to attend to by gradient descent. Bonus: notes softmax also lets a token
combine information from multiple positions at once, which a single pick cannot.`,
        explanation:
          "Attention is a *soft*, differentiable lookup: softmax over dot products gives weights that both mix multiple values and provide gradients to train the query/key projections. A hard argmax kills the gradient and the ability to blend.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `Attention is not just theory — its shape drives real engineering and evaluation
choices:

- **Cost is quadratic in sequence length.** Scoring every query against every key
  is \`n × n\` dot products, so compute and memory grow like \`O(n^2)\` in the number
  of tokens \`n\`. Doubling the context roughly **quadruples** the attention cost.
  This is the reason long contexts are expensive and why a whole research line
  (sparse, linear, and flash attention) chases cheaper approximations.

- **The KV cache is why generation is fast.** When generating token by token, the
  keys and values of earlier tokens don't change, so they are **cached** and
  reused; each new token only computes its own query against the stored keys. The
  KV cache is a dominant chunk of memory at inference — and the practical thing
  that makes autoregressive decoding tractable.

- **Real attention is multi-head.** Instead of one attention with the full
  \`d_model\`, models run \`h\` **heads** in parallel, each with a smaller \`d_k\`, and
  concatenate the results. Different heads attend to different things (one tracks
  the previous token, another matches subjects to verbs), giving the layer several
  independent "lookups" at once. The single-head math above is exactly one head.

- **Reading and evaluating attention.** Attention **weights are interpretable**:
  you can plot the \`n × n\` weight matrix and literally see which tokens *"it"*
  attended to. This is a powerful debugging and analysis tool — but treat it with
  care. Attention weights show *where* information was pulled from, not *why* the
  final prediction was made; a large body of work shows attention maps are **not
  always faithful explanations** of model behaviour. To actually test what a head
  does, prefer **ablations** (zero or perturb a head and measure the effect on the
  output) over eyeballing the heatmap alone.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "A colleague removes the `1 / sqrt(d_k)` scaling from a large-`d_k` attention layer and finds training stalls — the loss barely moves. What is the most likely mechanism?",
        choices: [
          "Without scaling the attention weights no longer sum to 1, so the output is unnormalised.",
          "Unscaled dot products grow with d_k, pushing softmax into a saturated near-argmax regime where gradients through the non-selected tokens vanish.",
          "The value vectors are no longer projected, so there is nothing to mix.",
          "Removing the scaling makes attention quadratic instead of linear in sequence length.",
        ],
        answerIndex: 1,
        explanation:
          "The softmax still normalises to 1 (that is softmax's job, not the scaling's). The scaling controls the *magnitude* of the scores: for large d_k the raw dot products get big, softmax saturates onto one token, and gradients to the rest vanish — so learning stalls. Dividing by sqrt(d_k) keeps scores in a trainable range.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — implement and visualise attention (30–40 min, hands-on)",
        markdown: `Make the mechanics concrete by building the step yourself and looking at what it
attends to.

1. **Code the core in NumPy.** Write a single function
   \`attention(Q, K, V)\` that computes \` softmax(Q @ K.T / sqrt(d_k)) @ V\`.
   Reproduce the worked example above exactly:

   \`\`\`python
   import numpy as np
   def attention(Q, K, V):
       dk = K.shape[-1]
       scores = Q @ K.T / np.sqrt(dk)
       w = np.exp(scores - scores.max(-1, keepdims=True))
       w = w / w.sum(-1, keepdims=True)
       return w @ V, w

   K = np.array([[1,0],[1,1],[0,1]], float)
   V = np.array([[1,0],[0,1],[1,1]], float)
   q = np.array([[1,1]], float)
   out, w = attention(q, K, V)
   print(w.round(3), out.round(3))   # -> [[0.248 0.503 0.248]] [[0.497 0.752]]
   \`\`\`

   Confirm you get weights \`[0.25, 0.50, 0.25]\` and output \`[0.50, 0.75]\`. Then
   **remove the \` / sqrt(dk)\`** and rerun with keys scaled up by 10× — watch the
   weights collapse toward \`[0, 1, 0]\`. That is softmax saturation.

2. **Add a causal mask.** Extend it to full self-attention over a length-\`n\`
   sequence (\`Q = K = V\` projected from the same input) and set the upper triangle
   of \`scores\` to \`-inf\` before softmax. Verify token \`i\` puts zero weight on any
   \`j > i\` — the constraint \`transformers-gpt\` relies on.

3. **Look at a real attention map.** Load a small pretrained model (e.g. via
   Hugging Face \`transformers\` with \`output_attentions=True\`), run the sentence
   *"The animal didn't cross the street because it was too tired"*, and plot the
   weights of a head at *"it"*. See whether any head puts weight on *"animal"*.

**Deliverable:** a short note (5–8 sentences) reporting (a) that your hand-built
function reproduces \`[0.25, 0.50, 0.25]\`, (b) what happened to the weights when
you dropped the scaling and enlarged the keys, and (c) one sentence on whether the
real model's attention at *"it"* landed where you expected — and why an attention
map is suggestive but not proof of *why* the model predicted what it did.`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "Vaswani et al. — Attention Is All You Need",
        url: "https://arxiv.org/abs/1706.03762",
        author: "Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (2017)",
        note: "The original Transformer paper. Section 3.2 defines scaled dot-product attention and multi-head attention; the scaling and the path-length/parallelism arguments are stated directly.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "Jay Alammar — The Illustrated Transformer",
        url: "https://jalammar.github.io/illustrated-transformer/",
        author: "Jay Alammar",
        note: "The canonical visual walkthrough of queries, keys, values, and multi-head self-attention — worked pictures that mirror the numeric example above.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Attention — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "In scaled dot-product attention, what is the output for a query token actually a weighted sum of?",
        choices: [
          "The key vectors, weighted by the query.",
          "The value vectors, weighted by the softmax of the scaled query-key dot products.",
          "The element-wise product of the query and key vectors.",
          "Only the value of the single highest-scoring key (a hard argmax).",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "Why can self-attention capture a long-range dependency (like linking `it` to `animal`) more easily than an RNN?",
        choices: [
          "Self-attention has strictly more parameters than an RNN.",
          "Any two positions are connected by a constant O(1) number of steps, whereas an RNN must pass information through O(n) sequential steps where it can be forgotten.",
          "Self-attention processes tokens strictly left-to-right, like an RNN but faster.",
          "RNNs cannot represent sequences longer than their hidden state.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "What is the purpose of dividing the query-key dot products by sqrt(d_k) before the softmax?",
        choices: [
          "It normalises the value vectors to unit length before they are mixed.",
          "It is what makes the attention weights sum to 1.",
          "It keeps the dot products from growing with d_k, which would push softmax into a saturated near-argmax regime with vanishing gradients.",
          "It converts the raw scores into a probability distribution.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "Explain how self-attention lets a token perform content-based addressing, and why this gives it an advantage over recurrence and convolution. Reference queries, keys, and values, and the notion of path length between positions.",
        answerKey: {
          criteria: [
            {
              id: "qkv-mechanism",
              description:
                "Correctly describes the mechanism: each token projects a query, key, and value; the score is the scaled dot product of a query with each key; a softmax turns scores into weights that sum to 1; the output is the weighted sum of the value vectors.",
              points: 3,
            },
            {
              id: "content-addressing",
              description:
                "Explains content-based addressing: a token retrieves by *what it is looking for* (query-key match on content), not by position, so any position can attend to any other in a single O(1) step regardless of distance.",
              points: 3,
            },
            {
              id: "contrast",
              description:
                "Contrasts with recurrence (O(n) sequential path, information can be forgotten along the way) and convolution (fixed local receptive field, needs depth to reach far), noting self-attention's O(1) path length and full parallelism.",
              points: 2,
            },
          ],
          guidance:
            "Full marks require the q/k/v + softmax-weighted-sum-of-values mechanism AND the content-based, single-hop addressing idea. Credit the contrast fully only if BOTH recurrence and convolution are addressed with a correct reason (path length / receptive field), not just named.",
        },
        points: 8,
      },
    ],
  },
};
