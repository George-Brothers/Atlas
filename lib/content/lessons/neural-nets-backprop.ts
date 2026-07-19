/**
 * SPINE LESSON — authored in full.
 *
 * "Neural nets & backprop — how a model learns from its mistakes."
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it — mirroring the `tokens-embeddings` showcase reference.
 *
 * This is the topic that supplies the *learning mechanics* for the rest of the
 * spine: the embedding matrix in `tokens-embeddings` and every Transformer
 * weight are trained by exactly the gradient-descent-plus-backprop loop taught
 * here.
 */
import type { AuthoredLesson } from "../types";

export const neuralNetsBackpropLesson: AuthoredLesson = {
  topicSlug: "neural-nets-backprop",
  title: "Neural nets & backprop — how a model learns from its mistakes",
  estMinutes: 38,
  status: "published",
  objectives: [
    "Describe a feed-forward network as alternating linear maps (Wx+b) and nonlinearities, and explain why the nonlinearities are essential.",
    "Explain what a loss function measures and how gradient descent uses the negative gradient to reduce it.",
    "State what backpropagation computes and why the chain rule lets it get the gradient of every parameter in one backward pass.",
    "Hand-compute a forward pass, a loss, and the backprop gradients for a tiny network, then take one gradient-descent step.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "How a model learns from its mistakes",
        markdown: `A neural network starts out *knowing nothing*: its parameters are random
numbers. You show it an input, it produces a confidently wrong answer, and then
— this is the whole game — it nudges every one of its parameters a tiny bit in
the direction that would have made the answer *less* wrong. Do that a few
billion times over a mountain of examples and the random numbers turn into
something that can translate French or predict the next token.

Two ideas make that loop work, and almost nothing else does the heavy lifting:
**gradient descent** (which direction is "less wrong", and how far to step) and
**backpropagation** (how to compute that direction for *every* parameter at
once, cheaply). This lesson opens both boxes.

We'll follow the same four questions you'll reuse for every topic in atlas:

1. **What is it?** — a feed-forward network as layers of linear maps and
   nonlinearities.
2. **Why does it work?** — a loss function, and gradient descent walking
   downhill on it.
3. **Why is it impressive?** — one generic algorithm trains anything
   differentiable, for the price of about one forward pass.
4. **How would you use or evaluate it?** — the knobs (learning rate, loss
   choice) and the failure modes (vanishing gradients, bad steps).

By the end you should be able to take a two-weight network, do the forward pass,
the backward pass, and one update *by hand* — and explain why the chain rule is
what makes training a billion-parameter model even possible.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — layers of linear maps and nonlinearities",
        markdown: `A **feed-forward neural network** is a function that transforms an input vector
into an output vector by passing it through a stack of **layers**. Each layer
does exactly two things, in order:

- **A linear map:** multiply by a weight matrix and add a bias — \`z = Wx + b\`.
  \`W\` and \`b\` are the layer's **parameters** (the numbers that get learned).
  This is just a weighted sum: every output number is a mix of all the input
  numbers.
- **A nonlinearity (activation):** apply a simple, fixed, element-wise function
  to \`z\`. The common ones are **ReLU** (\`relu(z) = max(0, z)\` — pass positives
  through, zero out negatives), **sigmoid** (\`1 / (1 + e^{-z})\`, squashes to
  \`(0, 1)\`), and **tanh** (squashes to \`(-1, 1)\`).

Stack a few of these — \`x → (linear, nonlinear) → (linear, nonlinear) → … →
prediction\` — and you have the network. Running an input all the way through to
a prediction is the **forward pass**.

**Why the nonlinearity is not optional.** Here is the single most important
structural fact: if you removed the activations and stacked only linear maps,
the whole network would collapse. \`W_2(W_1 x + b_1) + b_2 = (W_2 W_1)x +
(W_2 b_1 + b_2)\` — a product of matrices is *just another matrix*, so a hundred
linear layers are mathematically identical to **one** linear layer. No matter
how deep, a purely linear net can only draw a straight-line (hyperplane)
decision boundary. The nonlinearities are what let successive layers bend and
fold the space, so the network can represent curved, compositional functions —
that's where all the expressive power comes from.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "Forward pass and backward pass through a network",
        diagram: `flowchart LR
  X["input<br/>x"] --> L1["layer 1<br/>z1 = W1 x + b1<br/>a1 = relu z1"]
  L1 --> L2["layer 2<br/>z2 = W2 a1 + b2<br/>y = out"]
  L2 --> P["prediction<br/>y"]
  P --> LOSS["loss<br/>L = compare y, target"]
  LOSS -. "&#8592; dL/dy" .-> P
  P -. "&#8592; dL/dz2, dL/dW2" .-> L2
  L2 -. "&#8592; dL/da1, dL/dz1, dL/dW1" .-> L1
  L1 -. "&#8592; dL/dx" .-> X`,
        caption:
          "Solid arrows are the forward pass: the input flows left-to-right through each layer's linear map and nonlinearity, producing a prediction and then a scalar loss. Dashed arrows are backpropagation: starting from the loss, the error signal flows right-to-left, and at each layer the chain rule turns the incoming gradient into the gradient for that layer's weights AND the gradient to pass further back.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — a loss to minimize, and walking downhill",
        markdown: `Training needs a single number that says *how wrong* the network currently is.
That's the **loss function** \`L\`. It compares the prediction \`y\` to the known
target \`t\` and returns a scalar — smaller is better:

- **Mean squared error (MSE)** for regression: \`L = (1/2)(y - t)^2\` per example.
  The \`1/2\` is a convenience so the derivative is clean.
- **Cross-entropy** for classification / next-token prediction: it penalises the
  model for putting low probability on the correct class. This is the loss that
  trains language models.

Now think of \`L\` as a function of *all the parameters at once*. With millions of
weights, this is a surface in a millions-of-dimensions space, and training is a
search for a low point on it. The tool for that search is the **gradient**,
written \`∇L\`: the vector of **partial derivatives** of the loss with respect to
every parameter, \`[∂L/∂w_1, ∂L/∂w_2, …]\`. Each entry answers a local question:
*if I nudge this one weight up a hair, does the loss go up or down, and how
steeply?* The gradient as a whole points in the direction of **steepest
increase** of the loss.

We want to go *down*, so we step in the **opposite** direction. That's
**gradient descent**:

\`\`\`
w  ←  w  -  η · ∂L/∂w        (for every parameter w)
\`\`\`

The **learning rate** \`η\` (eta) is the step size. Too small and training crawls;
too large and you overshoot the valley and the loss can bounce or diverge.
Repeat — forward pass, compute loss, compute gradient, step downhill — and the
loss ratchets down. The one hard part left is: how do you actually get
\`∂L/∂w\` for *every* weight? That's backprop.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — forward pass, backprop, and one step by hand",
        markdown: `Take the smallest network that still shows everything: two weights in a chain,
one nonlinearity.

\`\`\`
y = w2 · relu(w1 · x)
L = (1/2)(y - t)^2
\`\`\`

Pick concrete numbers: input \`x = 2\`, target \`t = 1\`, and current weights
\`w1 = 0.5\`, \`w2 = 1.5\`. Learning rate \`η = 0.1\`.

**Forward pass** — compute left to right, and *cache* each intermediate value
(backprop will reuse them):

| quantity | formula | value |
|----------|---------|-------|
| \`z1\` (pre-activation) | \`w1 · x = 0.5 · 2\` | \`1.0\` |
| \`h\`  (activation) | \`relu(1.0)\` | \`1.0\` |
| \`y\`  (prediction) | \`w2 · h = 1.5 · 1.0\` | \`1.5\` |
| \`L\`  (loss) | \`(1/2)(1.5 - 1)^2\` | \`0.125\` |

**Backward pass** — apply the chain rule from the loss backward, multiplying
local derivatives. Each step reuses a cached value:

\`\`\`
dL/dy   = (y - t)          = 1.5 - 1        = 0.5
dL/dw2  = dL/dy · h        = 0.5 · 1.0      = 0.5     # dy/dw2 = h
dL/dh   = dL/dy · w2       = 0.5 · 1.5      = 0.75    # dy/dh  = w2
dL/dz1  = dL/dh · relu'(z1)= 0.75 · 1       = 0.75    # relu'(1.0)=1 since z1>0
dL/dw1  = dL/dz1 · x       = 0.75 · 2       = 1.5     # dz1/dw1 = x
\`\`\`

That's the entire gradient: \`∂L/∂w1 = 1.5\`, \`∂L/∂w2 = 0.5\`. Notice we swept the
error signal from \`y\` back to \`w1\` in **one pass**, reusing \`dL/dy\` and
\`dL/dh\` instead of recomputing them.

**One gradient-descent step** (\`w ← w - η · ∂L/∂w\`):

\`\`\`
w1 ← 0.5 - 0.1 · 1.5 = 0.35
w2 ← 1.5 - 0.1 · 0.5 = 1.45
\`\`\`

**Did it help? Re-run the forward pass with the new weights:**

\`\`\`
z1 = 0.35 · 2 = 0.7 ;  h = relu(0.7) = 0.7 ;  y = 1.45 · 0.7 = 1.015
L  = (1/2)(1.015 - 1)^2 ≈ 0.000113
\`\`\`

The loss fell from \`0.125\` to about \`0.0001\` after a *single* step — the
prediction moved from \`1.5\` toward the target \`1\`. That is the whole learning
loop, and a real network is just this exact procedure with matrices instead of
scalars and millions of weights instead of two.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things here are genuinely remarkable, and worth being able to say out loud:

- **One algorithm trains anything differentiable.** Backprop doesn't care what
  the network *does*. If every operation between the input and the loss has a
  derivative, the same forward-then-backward procedure computes the gradient —
  whether the model is a tiny classifier, a convolutional vision net, or a
  billion-parameter Transformer. You don't design a bespoke learning rule per
  architecture; you compose differentiable pieces and let the chain rule sort
  out the credit.

- **The whole gradient costs about one forward pass.** The naive way to find
  \`∂L/∂w\` for each weight would be to nudge that weight, re-run the entire
  network, and see how the loss changed — that's one full forward pass *per
  parameter*, hopeless at a billion parameters. Backprop instead reuses the
  cached forward values and sweeps the error signal backward **once**, getting
  *all* the partial derivatives together in \`O(network size)\` — roughly the same
  cost as the forward pass itself.

- **Nobody computes the derivatives by hand.** Modern **automatic
  differentiation** frameworks (PyTorch, JAX) record the operations of the
  forward pass as a graph and generate the exact backward pass for you. You write
  only the forward computation; the gradient of a novel architecture is,
  effectively, *free*. Karpathy's \`micrograd\` is ~150 lines that implement this
  whole idea, and it is the same idea that scales to frontier models.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain why stacking linear layers with no nonlinearity between them cannot represent anything more expressive than a single linear layer — and what the nonlinearity buys you.",
        rubric: `A strong answer hits: (1) composing linear maps gives another linear map —
\`W_2(W_1 x + b_1) + b_2\` simplifies to \`(W_2 W_1)x + const\`, i.e. one effective
weight matrix and bias; (2) so any depth of purely linear layers collapses to a
single linear function and can only draw a straight-line / hyperplane boundary;
(3) the nonlinearity (ReLU/sigmoid/tanh) breaks that collapse, letting successive
layers bend/fold the space so the network can represent curved, compositional
functions. Bonus: names a specific activation and that it's applied
element-wise.`,
        explanation:
          "A product of matrices is just another matrix, so linearity is contagious: without a nonlinearity in between, depth is an illusion. The activation is the only thing that makes a deep network more powerful than a shallow one.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `Once you see training as "descend the loss surface", the practical knobs and
failure modes line up:

- **The learning rate is the knob you tune first.** It sets the step size in
  \`w ← w - η·∂L/∂w\`. Too small and training is glacial; too large and steps
  overshoot the valley, so the loss stalls, oscillates, or diverges to \`NaN\`.
  In practice you use a **schedule** (warm up, then decay) rather than one fixed
  value, and you watch the loss curve to diagnose the rate.

- **Watch the gradients, not just the loss.** The dashed backward arrows carry
  real numbers, and they can go wrong. **Vanishing gradients:** with saturating
  activations like sigmoid, \`relu'\`-style local derivatives near zero multiply
  together across many layers and the error signal reaching early layers shrinks
  to nothing — those layers stop learning. **Exploding gradients:** the same
  product blows up. This is a big reason ReLU (derivative exactly \`1\` on the
  positive side) and tricks like normalization and residual connections exist.

- **You train on one set and evaluate on another.** A low *training* loss only
  means the network memorised the examples it saw. What you actually care about
  is the loss on **held-out** data (generalization). A gap where training loss
  keeps falling but validation loss rises is **overfitting** — the signal to stop
  early or regularise.

- **Pick the loss to match the task.** MSE for continuous targets, cross-entropy
  for classification and next-token prediction. The loss defines what "wrong"
  means, and therefore what the gradients push toward — a mismatched loss trains
  the wrong behaviour even if the architecture is fine.

This is not a side topic: the exact gradient-descent-plus-backprop loop here is
what trains the learned **embedding matrix** from the \`tokens-embeddings\` lesson
and every weight inside a Transformer. "The rows are learned" and "the weights
are trained" both cash out as *this loop*.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "Why is backpropagation dramatically cheaper than estimating each weight's gradient by nudging it and re-running the network?",
        choices: [
          "Backprop skips most of the weights and only updates the ones near the output layer.",
          "Backprop reuses the cached forward-pass values and sweeps the error signal backward once, getting every partial derivative together in about the cost of one forward pass, instead of one full pass per weight.",
          "Backprop uses a lower-precision approximation of the gradient, trading accuracy for speed.",
          "Backprop computes the loss without needing a forward pass at all.",
        ],
        answerIndex: 1,
        explanation:
          "Nudging-and-re-running is O(one forward pass per parameter) — hopeless at scale. Backprop applies the chain rule over the cached forward values in a single backward sweep, yielding the entire gradient in O(network size), roughly one extra forward pass total.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — build and train micrograd's tiniest net (30–40 min, hands-on)",
        markdown: `Make the mechanics stick by watching gradients flow through real code.

1. **Reproduce the worked example by hand, then in code.** Take
   \`y = w2·relu(w1·x)\` with \`x=2, t=1, w1=0.5, w2=1.5\`. Recompute the forward
   pass, the loss, and \`dL/dw1\`, \`dL/dw2\` on paper. Then check yourself with an
   autodiff framework:

   \`\`\`python
   import torch
   x = torch.tensor(2.0); t = torch.tensor(1.0)
   w1 = torch.tensor(0.5, requires_grad=True)
   w2 = torch.tensor(1.5, requires_grad=True)
   y = w2 * torch.relu(w1 * x)
   L = 0.5 * (y - t) ** 2
   L.backward()
   print(w1.grad, w2.grad)   # expect 1.5 and 0.5
   \`\`\`

2. **Take a real step and confirm the loss drops.** Update
   \`w ← w - 0.1·w.grad\` for both weights, re-run the forward pass, and check the
   loss fell from \`0.125\` toward zero. Then loop the whole thing 50 times and
   plot the loss — watch it ratchet down.

3. **Read the engine.** Skim Karpathy's \`micrograd\` (~150 lines). Find where the
   forward pass builds the graph and where \`backward()\` walks it in reverse
   applying the chain rule. Confirm that ReLU, add, and multiply each just define
   a **local** derivative and let the graph compose them.

4. **Break it on purpose.** Bump the learning rate to something large (say
   \`η = 5\`) and watch the loss diverge / oscillate. Then chain several sigmoid
   layers and observe the early-layer gradients shrink toward zero — vanishing
   gradients, live.

**Deliverable:** a short note (5–8 sentences) reporting your hand-computed
gradients vs. the autodiff values (they should match), the loss before and after
one step, and one sentence on what happened when you made the learning rate too
large.`,
      },
    },
    {
      kind: "citation",
      body: {
        label:
          "Karpathy — The spelled-out intro to neural networks and backpropagation: building micrograd",
        url: "https://www.youtube.com/watch?v=VMj-3S1tku0",
        author: "Andrej Karpathy",
        note: "Builds a full autodiff engine and trains a net from scratch, deriving backprop one local derivative at a time. Companion code: github.com/karpathy/micrograd.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "3Blue1Brown — Neural networks (backpropagation chapters)",
        url: "https://www.3blue1brown.com/topics/neural-networks",
        author: "Grant Sanderson (3Blue1Brown)",
        note: "The canonical visual intuition for gradient descent and what backpropagation is computing, including how the chain rule assigns credit backward through the layers.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Neural nets & backprop — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "A colleague stacks ten `Wx + b` layers with no activation functions between them and expects it to be far more powerful than one layer. What's wrong?",
        choices: [
          "Nothing — more layers always add expressive power, activations only speed up training.",
          "The composition of linear maps is itself a single linear map, so the ten layers collapse to one effective linear function; without a nonlinearity, depth adds no expressive power.",
          "It will work, but only if every weight matrix is the same shape.",
          "The problem is the biases — remove the `b` terms and the ten layers become nonlinear.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "In gradient descent, the update rule is `w ← w - η · ∂L/∂w`. Why the minus sign?",
        choices: [
          "It cancels the learning rate so the step size stays fixed.",
          "The gradient points in the direction of steepest *increase* of the loss, so stepping in the opposite direction decreases the loss.",
          "The loss is always negative, so subtracting makes it positive.",
          "It converts the partial derivative into a probability.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "For the network `y = w2·relu(w1·x)` with `x=2`, `w1=0.5`, `w2=1.5`, target `t=1`, the forward pass gives `y=1.5` and loss `0.125`. Using the chain rule, what is `∂L/∂w1`?",
        choices: [
          "0.5, because `∂L/∂w1` equals `(y - t)`.",
          "0.75, because you stop at the ReLU.",
          "1.5, from `dL/dy · w2 · relu'(z1) · x = 0.5 · 1.5 · 1 · 2`.",
          "3.0, from `(y - t) · w2 · x`.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "Explain, end to end, how one training step updates the weights of a feed-forward network: name the forward pass, the loss, what the gradient is, how backprop computes it, and how the weights change. Then say why backprop is efficient enough to make this practical for a network with millions of parameters.",
        answerKey: {
          criteria: [
            {
              id: "forward-loss",
              description:
                "Describes the forward pass (input flows through linear maps + nonlinearities to a prediction) and the loss as a scalar measuring how wrong the prediction is versus the target.",
              points: 3,
            },
            {
              id: "gradient-descent",
              description:
                "Explains the gradient as the vector of partial derivatives ∂L/∂w for every parameter (direction of steepest increase), and that gradient descent steps each weight in the negative-gradient direction scaled by the learning rate: w ← w - η·∂L/∂w.",
              points: 3,
            },
            {
              id: "backprop-efficiency",
              description:
                "Notes that backprop applies the chain rule in a single backward pass, reusing cached forward-pass activations to get every parameter's gradient at roughly the cost of one forward pass — instead of re-running the network once per weight.",
              points: 2,
            },
          ],
          guidance:
            "Full marks require the forward-pass-plus-loss description AND the negative-gradient update AND the chain-rule/one-backward-pass efficiency point. Naming a specific loss (MSE, cross-entropy) or activation is a nice detail but not required for full credit.",
        },
        points: 8,
      },
    ],
  },
};
