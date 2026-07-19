/**
 * SPINE LESSON — authored in full.
 *
 * "Transformers & GPT — stacking attention into depth."
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it. Assembles `attention` + MLPs over `tokens-embeddings` into the
 * decoder-only block, and forward-references `training-vs-inference`.
 */
import type { AuthoredLesson } from "../types";

export const transformersGptLesson: AuthoredLesson = {
  topicSlug: "transformers-gpt",
  title: "Transformers & GPT — stacking attention into depth",
  estMinutes: 38,
  status: "published",
  objectives: [
    "Assemble a decoder-only Transformer block from attention + MLP + residual + pre-norm, in the correct order.",
    "Explain the residual stream as the model's working memory that each block reads from and writes an additive update back to.",
    "Describe causal masking and why it enables autoregressive generation and fully parallel training from the same weights.",
    "Explain how GPT stacks N identical blocks into depth and finishes with a final norm + unembedding to vocab logits.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "One block, stacked ninety-six times",
        markdown: `In the last lesson your text became a sequence of **embedding vectors** — a grid
of numbers, one row per token. In the *attention* lesson you saw how one token
can look at the others and pull in what it needs. This lesson is where those
pieces become an actual **GPT**.

Here is the surprising part: GPT is not a zoo of clever components. It is **one
block design, repeated**. GPT-2 small stacks that block 12 times; GPT-3 stacks
it 96 times. Each block does exactly two things — mix information *across*
tokens (attention), then think *within* each token (an MLP) — and every block is
wired the same way. The depth is where the magic accumulates, but the unit is
almost embarrassingly simple.

We'll follow the same four questions we use for every atlas topic:

1. **What is it?** — the decoder-only block: attention + MLP, each wrapped in
   residual + norm.
2. **Why does it work?** — the **residual stream** as working memory, and
   **causal masking** as the trick that makes it a next-token predictor.
3. **Why is it impressive?** — what "one block, N times" buys you that nothing
   before it could.
4. **How would you use or evaluate it?** — depth vs width, parameter budgets,
   and how the architecture shapes what the model can and can't do.

By the end you should be able to draw the block from memory and explain why the
same weights that train on a whole document in parallel can also generate one
token at a time.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — the decoder-only Transformer block",
        markdown: `A GPT is a stack of **identical decoder-only blocks**. Each block takes a
sequence of vectors in and returns a sequence of the same shape out, so blocks
snap together like Lego. One block has exactly **two sublayers**:

- **Multi-head self-attention** — the *communication* step. Each token builds a
  query and looks at every allowed token's keys, then pulls a weighted mix of
  their values. "Multi-head" means this happens in parallel in several smaller
  subspaces (heads), each free to specialize — one head might track the previous
  token, another the subject of the sentence — and the heads' outputs are
  concatenated and projected back. This is the *only* place tokens exchange
  information.
- **Position-wise MLP** (the feed-forward sublayer) — the *computation* step.
  The same little two-layer network is applied to **each token vector
  independently**: **up-project** to a wider hidden size (typically **4×**
  \`d_model\`), apply a nonlinearity (**GELU**), then **down-project** back. This
  is where most of a token's "thinking" and most of the model's parameters live.

Each sublayer is wrapped identically, and the wrapper is the whole game. Modern
GPTs use **pre-norm**: normalize *first*, run the sublayer, then **add the result
back**:

\`\`\`
x = x + Attention(LayerNorm(x))
x = x + MLP(LayerNorm(x))
\`\`\`

That \`x = x + ...\` is a **residual connection**. Notice the sublayer never
*replaces* \`x\` — it only computes an update that gets **added** on. Everything
else about GPT — the residual stream, the parallel training, the depth — falls
out of that one wiring choice.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "One pre-norm decoder block",
        diagram: `flowchart TD
  IN["residual stream x<br/>(one vector per token)"] --> N1["LayerNorm"]
  N1 --> ATT["Multi-Head<br/>Self-Attention<br/>(causally masked)"]
  IN --> ADD1(("+"))
  ATT --> ADD1
  ADD1 --> N2["LayerNorm"]
  N2 --> MLP["MLP<br/>up-project 4x<br/>GELU<br/>down-project"]
  ADD1 --> ADD2(("+"))
  MLP --> ADD2
  ADD2 --> OUT["residual stream x'<br/>(same shape, to next block)"]`,
        caption:
          "A single pre-norm block. The residual stream (left edge) flows straight down and is never overwritten: each sublayer reads a normalized COPY of it, computes an update, and that update is ADDED back at the '+' nodes. Stack N of these, then a final norm + unembedding, and you have a GPT.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — the residual stream is working memory",
        markdown: `Look again at \`x = x + sublayer(LayerNorm(x))\`. Because every sublayer only ever
*adds* to \`x\`, the vector flowing down the left edge of every block is a
**running sum** — and that running sum is the single most useful mental model for
how a Transformer computes. The mechanistic-interpretability community (Anthropic's
Transformer Circuits work) calls it the **residual stream**: think of it as a
shared **communication bus** or the model's **working memory**.

Three properties make it powerful:

- **Information persists by default.** A fact written into the stream by layer 2
  is still there at layer 40 unless some later layer actively adds something that
  cancels it. Nothing is forgotten just by passing through a block — the identity
  path carries it forward for free.
- **Every block reads and writes the same bus.** Each sublayer **reads** the
  stream (through its LayerNorm) and **writes** an additive update back. Blocks
  don't hand off a fresh representation; they *edit a shared draft*. Later heads
  can pick up what earlier heads deposited — this is how multi-step reasoning
  gets composed across depth.
- **Gradients flow straight through.** The \`+ x\` gives backprop a direct,
  unblocked path from the loss to every layer. Without it, stacking dozens of
  sublayers would make gradients vanish and deep networks untrainable. The
  residual connection is *the* reason you can stack 96 blocks and still train
  them.

The **LayerNorm** matters too: before each sublayer reads the stream, it
re-centers and re-scales that vector to a stable statistical range, so a sublayer
40 layers deep sees inputs in the same regime as one near the input. Pre-norm
(norm *inside* the residual branch, identity path left clean) is what keeps very
deep stacks stable — it's why essentially every modern GPT switched to it.

**Causal masking** is the second load-bearing idea. Self-attention would happily
let token 3 attend to token 7 — but for a next-token predictor that would be
cheating: predicting token 4 while peeking at token 7 is looking at the answer.
So before the attention softmax, we add a **mask** that sets every score for a
**future** position to \`-inf\`. After softmax those weights become exactly zero,
so token \`t\` can attend only to tokens \`≤ t\`. This one change is what makes the
stack a valid **autoregressive** model — and, as we'll see, it's also what lets
you train on an entire document in a single parallel pass.

(One more piece: attention is **permutation-invariant** — it has no built-in
sense of order. So GPT injects **positional information**, either as learned
position embeddings added to the token embeddings or via **rotary embeddings
(RoPE)** applied inside attention, so "the dog bit the man" and "the man bit the
dog" aren't identical to the model.)`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — trace the stream, then count the parameters",
        markdown: `Two small, concrete computations. All numbers are **illustrative** — the point
is the mechanics, not the exact values.

**1. One vector through one pre-norm block (additive updates).**

Follow a single token's vector \`x\` (shown 2-dimensional so we can write it out;
real \`d_model\` is 768–12288). At each sublayer the block reads a normalized copy,
produces an update, and **adds** it back:

| step | operation | result (the residual stream) |
|------|-----------|------------------------------|
| enter block | \`x0\` | \`[2.0, 1.0]\` |
| attention writes | \`x1 = x0 + attn\`, with \`attn = [0.3, -0.5]\` | \`[2.3, 0.5]\` |
| MLP writes | \`x2 = x1 + mlp\`, with \`mlp = [-0.1, 0.4]\` | \`[2.2, 0.9]\` |

The original \`[2.0, 1.0]\` is never thrown away — both sublayers only nudged it
(\`2.0 → 2.3 → 2.2\`). Multiply this by N blocks and you see the residual stream
as a long chain of small additive edits to a persistent working memory.

**2. How big is a block? (parameter count).**

Let \`d = d_model\` be the model width. Per block, ignoring biases and norms:

- **Attention**: four \`d × d\` projections — query, key, value, and the output
  projection — so \`4 · d²\` parameters. (Splitting into heads just partitions
  the same \`d × d\` matrices; it doesn't change the count.)
- **MLP** with the standard 4× hidden size: an up-projection \`d × 4d\` and a
  down-projection \`4d × d\`, so \`4d² + 4d² = 8 · d²\` parameters.
- **Per block total**: \`4d² + 8d² = 12 · d²\`. The MLP is **twice** the
  attention — most parameters do per-token computation, not mixing.

Plug in \`d = 1024\` and a **12-block** model (a small GPT; GPT-2 small is
narrower at \`d = 768\`, which the applied task below works out exactly):

\`\`\`
d^2                = 1024 * 1024      = 1,048,576
per-block params   = 12 * d^2         = 12,582,912   (~12.6M)
12 blocks          = 12 * 12,582,912  = 150,994,944  (~151M)
\`\`\`

About **151M** parameters just in the blocks (the token + position embeddings
and the unembedding add more). The headline number is a rule of thumb worth
remembering: **~12 · d² per layer**, so cost grows with the **square** of the
width and **linearly** with depth.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things about this architecture are genuinely remarkable:

- **One block design scales to GPT-scale.** There is no architectural trick that
  gets bolted on at large sizes — GPT-3 is GPT-2's block copy-pasted more times
  and made wider. The residual stream keeps information and gradients flowing
  through arbitrarily deep stacks, so "make it bigger" is a real, working plan
  rather than a wish. Almost nothing else in deep learning composes this cleanly.

- **The same weights train in parallel and generate sequentially.** Causal
  masking means that during training every position predicts its own next token
  **at once**, in a single forward pass over the whole document — you get a loss
  signal from every token simultaneously, which is what makes pretraining on
  trillions of tokens feasible. At inference the *identical* weights run one step
  at a time to generate. One mechanism, two modes. (That parallel-vs-sequential
  split is the through-line of the \`training-vs-inference\` lesson.)

- **Depth composes abstraction.** Because each block edits a shared residual
  stream, later layers build on structure earlier layers deposited. Empirically,
  early layers handle surface features (tokens, position, syntax) and later
  layers assemble higher-level, more semantic and task-relevant structure — an
  abstraction hierarchy that **emerges** from stacking one simple, uniform
  operation, never designed by hand.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain what the 'residual stream' is and why the `x = x + sublayer(x)` wiring is what makes it possible to stack many blocks. Mention both information flow and gradient flow.",
        rubric: `A strong answer hits: (1) the residual stream is the running sum carried down
the block by the residual connections — a shared working memory / communication
bus that each sublayer reads from and writes an additive update back to; (2)
because sublayers ADD rather than replace, information written by an early layer
persists by default to later layers; (3) the identity \`+ x\` path gives gradients
a direct, unblocked route back to every layer, preventing the vanishing gradients
that would otherwise make a deep stack untrainable. Bonus: pre-norm keeps the
identity path clean so very deep stacks stay stable.`,
        explanation:
          "The additive residual connection does double duty: information persists forward (nothing is overwritten) and gradients flow backward (a direct path to every layer) — together they are what let GPT stack dozens of identical blocks.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `Knowing the block is one design, repeated, changes how you reason about models in
practice:

- **Read a model's shape.** A model card gives you \`n_layers\`, \`d_model\`, and
  \`n_heads\`. From \`~12 · d² · n_layers\` you can sanity-check the parameter count
  in your head, and you know that widening (\`d_model\`) costs **quadratically**
  while deepening (\`n_layers\`) costs **linearly** — a real trade-off when you
  scale. \`n_heads\` just partitions \`d_model\` across heads; more heads means more,
  narrower attention subspaces, not more parameters.

- **The MLP is where the parameters are.** Two-thirds of a block's weights are in
  the feed-forward sublayer. This is why techniques that touch the MLP —
  mixture-of-experts (swap the one MLP for many, route each token to a few),
  quantizing or pruning it — move the needle most on size and speed.

- **Context cost is set by attention, not the MLP.** The MLP is per-token
  (linear in sequence length), but self-attention compares every token to every
  other — **quadratic** in sequence length. That \`O(n²)\` is exactly why long
  context is expensive and why so much research (FlashAttention, sliding-window,
  and other sparse schemes) attacks the attention step specifically.

- **How you'd evaluate the architecture's fingerprint.** Some model behaviors are
  architectural, not a data problem. Causal masking guarantees strict
  left-to-right generation (a token can never revise itself in light of later
  ones). Finite depth bounds how many sequential composition steps a single
  forward pass can do — which is one reason chain-of-thought helps: it moves
  extra reasoning steps out into the generated token sequence, where the model
  gets fresh forward passes. When you see a model fail at a deeply nested,
  multi-step task in one shot, "not enough sequential depth for this in a single
  pass" is a real hypothesis, not hand-waving.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "Inside a decoder-only Transformer block, at which point and how is the causal mask applied?",
        choices: [
          "After the whole block, by zeroing out the output vectors of future tokens.",
          "Inside self-attention, by adding -inf to the attention scores for future positions before the softmax, so those weights become zero.",
          "In the MLP sublayer, by masking half of the hidden units for future tokens.",
          "At the embedding step, by deleting the embeddings of tokens that come after the current one.",
        ],
        answerIndex: 1,
        explanation:
          "The mask lives inside self-attention: future-position scores are set to -inf before the softmax, so after softmax those attention weights are exactly zero and token t can attend only to tokens ≤ t. The MLP is per-token and never mixes across positions, so masking there would be meaningless.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — read, count, and reason about a real GPT (30 min)",
        markdown: `Make the architecture concrete with a real, small model.

1. **Count a real model's parameters.** Pick GPT-2 small's published config:
   \`n_layers = 12\`, \`d_model = 768\`, \`n_heads = 12\`, \`vocab = 50257\`. Using
   \`~12 · d²\` per block:
   - Compute the per-block and all-blocks parameter count by hand.
   - Add the embedding + unembedding: \`vocab · d_model\` (GPT-2 ties these
     weights, so count the matrix once). Compare your total to GPT-2 small's
     published **~124M** and see how close the rule of thumb gets you.

2. **Watch the residual stream.** Load \`gpt2\` in Hugging Face \`transformers\`
   with \`output_hidden_states=True\` and run a short prompt. You get one hidden
   state **per layer** — these are snapshots of the residual stream. Confirm they
   all share the same shape \`[seq_len, 768]\`, and measure how much each layer
   *changes* the stream (e.g. the norm of \`hidden[i+1] - hidden[i]\`). You are
   literally watching each block's additive update.

3. **Prove the causal mask exists.** Feed the model a prompt, then feed the same
   prompt with **extra tokens appended after** your position of interest. Confirm
   the logits/hidden state at the earlier position are **unchanged** — because of
   causal masking, later tokens cannot influence earlier ones.

**Deliverable:** a short note (5–8 sentences) reporting your hand-computed
parameter estimate vs the real ~124M (and where the gap comes from), one
observation about which layers change the residual stream the most, and a
one-sentence statement of what your step-3 experiment proved about causal masking.`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "The Illustrated GPT-2 (Visualizing Transformer Language Models)",
        url: "https://jalammar.github.io/illustrated-gpt2/",
        author: "Jay Alammar",
        note: "The clearest visual walkthrough of a decoder-only stack: masked self-attention, the per-token MLP, and how blocks stack up to token-by-token generation.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "A Mathematical Framework for Transformer Circuits",
        url: "https://transformer-circuits.pub/2021/framework/index.html",
        author: "Elhage et al. (Anthropic)",
        note: "Origin of the 'residual stream as a communication bus that blocks read from and write to' mental model used throughout this lesson. See also Karpathy's 'Let's build GPT: from scratch' (youtube.com/watch?v=kCc8FmEb1nY) for a from-scratch implementation.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Transformers & GPT — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "In a modern pre-norm decoder block, how is each sublayer (attention or MLP) wired into the residual stream?",
        choices: [
          "The sublayer replaces the stream: `x = sublayer(x)`.",
          "The stream is normalized, fed to the sublayer, and the sublayer's output is added back: `x = x + sublayer(LayerNorm(x))`.",
          "The sublayer output is multiplied elementwise into the stream: `x = x * sublayer(x)`.",
          "LayerNorm is applied after the addition, on the clean output path: `x = LayerNorm(x + sublayer(x))`.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "Within one decoder block, which sublayer lets tokens exchange information with each other, and which operates on each token independently?",
        choices: [
          "The MLP mixes across tokens; self-attention operates per token.",
          "Self-attention mixes information across tokens; the MLP operates on each token independently.",
          "Both mix across tokens; the residual connection separates them.",
          "Both operate per token; only LayerNorm mixes across tokens.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "A block has d_model = 2048 and the standard 4× MLP. Roughly how many parameters are in ONE block (ignore biases/norms), and which sublayer holds most of them?",
        choices: [
          "~4 · d² ≈ 17M, mostly in attention.",
          "~12 · d² ≈ 50M, split evenly between attention and the MLP.",
          "~12 · d² ≈ 50M, about two-thirds of it in the MLP.",
          "~24 · d² ≈ 100M, mostly in attention.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "Explain how the SAME set of GPT weights supports both fully parallel training and one-token-at-a-time generation. Name the mechanism responsible, describe what it does mechanically, and say why it makes training efficient.",
        answerKey: {
          criteria: [
            {
              id: "mechanism",
              description:
                "Identifies causal masking as the mechanism and describes it mechanically: attention scores for future positions are set to -inf before the softmax, so token t can attend only to tokens ≤ t (strictly left-to-right / autoregressive).",
              points: 3,
            },
            {
              id: "parallel-training",
              description:
                "Explains that because each position can only see earlier tokens, every position can predict its own next token simultaneously in a single forward pass over the whole sequence — one pass yields a loss signal from every token, which is what makes pretraining on huge corpora efficient.",
              points: 3,
            },
            {
              id: "two-modes-same-weights",
              description:
                "Notes that inference uses the identical weights but runs sequentially, feeding each generated token back in — same mechanism (causal masking), two modes (parallel training vs sequential generation).",
              points: 2,
            },
          ],
          guidance:
            "Full marks require naming causal masking AND connecting it to BOTH parallel training (every position supervised in one pass) and sequential generation with the same weights. Mentioning that the mask sets future scores to -inf before softmax is the key mechanical detail.",
        },
        points: 8,
      },
    ],
  },
};
