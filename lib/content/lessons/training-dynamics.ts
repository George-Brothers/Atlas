/**
 * Authored lesson — "Training dynamics — batches, schedules, and loss curves."
 *
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it. Mirrors the showcase lesson (`tokens-embeddings.ts`) in
 * structure, depth, and voice.
 *
 * This lesson gates the `training-dynamics` topic: it is backprop (topic
 * `neural-nets-backprop`) run at scale to minimize the language-modeling loss
 * (topic `language-modeling`).
 */
import type { AuthoredLesson } from "../types";

export const trainingDynamicsLesson: AuthoredLesson = {
  topicSlug: "training-dynamics",
  title: "Training dynamics — batches, schedules, and loss curves",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Explain the training loop — batch, step, epoch — and why mini-batch gradients are noisy but unbiased.",
    "Describe a learning-rate schedule (warmup then decay) and why each phase exists.",
    "Read a loss curve and diagnose underfitting, overfitting, and instability from the train/val signal.",
    "Summarize what scaling laws (Kaplan, Chinchilla) predict about loss vs compute, data, and parameters.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "What actually happens when a model trains",
        markdown: `A model does not "read a book and understand it." It does one small, dumb thing
billions of times: grab a random handful of examples, guess the next token for
each, measure how wrong it was, and nudge every weight a tiny bit in the
direction that would have made it less wrong. That handful is a **batch**. That
one nudge is a **step**. Stack tens of thousands of steps together and a pile of
random numbers turns into GPT.

The remarkable part is how *controllable* and *predictable* this process is.
The same loop runs on a laptop and on ten thousand GPUs. A handful of numbers —
the batch size, the **learning rate** and its schedule, the shape of the **loss
curve** — tell you almost everything about whether a run is healthy, and
**scaling laws** let you forecast a giant run's final loss from a few small
cheap ones.

We'll follow the four questions atlas uses for every topic:

1. **What is it?** — the training loop, concretely: batch, step, epoch, and the
   learning-rate schedule.
2. **Why does it work?** — why noisy mini-batch gradients are a good idea.
3. **Why is it impressive?** — loss is astonishingly predictable and diagnosable.
4. **How would you use or evaluate it?** — reading loss curves and diagnosing
   under/over-fitting and instability.

This is **backprop** (topic \`neural-nets-backprop\`) run at industrial scale to
minimize the **language-modeling loss** (topic \`language-modeling\`) — same
gradients, just repeated on enormous data with the machinery to keep it stable.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — the training loop and the schedule",
        markdown: `Training is a loop over four moves, repeated until you run out of compute:

- **Sample a mini-batch.** Draw a small random subset of the data — say 512
  sequences. The **batch size** is how many examples go into one estimate of the
  gradient.
- **Forward + backward.** Run the batch forward to compute the **loss** (for LMs,
  the cross-entropy of the predicted next-token distribution against the true
  next token), then run **backpropagation** to get the gradient of that loss with
  respect to every weight.
- **Optimizer step.** Update the weights using the gradient. Plain **SGD** moves
  each weight against its gradient scaled by the **learning rate**. **Adam** — the
  default for LLMs — keeps running estimates of the gradient's mean and variance
  and adapts the effective step size per-weight, which makes training far more
  robust.
- **Repeat.** One such iteration is a **step**. One full pass over the entire
  dataset is an **epoch**. Frontier LLMs often train for roughly a single epoch
  over a colossal corpus — so for them "steps" and "tokens seen", not epochs, are
  the natural clock.

Sitting on top of the optimizer is the **learning-rate schedule** — how the step
size changes *over time*. The near-universal recipe is **warmup then decay**:

- **Warmup.** Start the learning rate near zero and ramp it up (linearly) over
  the first few hundred to few thousand steps. Early on the weights are random and
  the gradients are large and erratic; a big step now can blow the model up.
  Warmup eases in while the model finds stable footing.
- **Decay.** After the peak, smoothly anneal the learning rate back down —
  commonly a **cosine** decay toward (near) zero by the end of training. Large
  steps early cover ground fast; small steps late let the model settle into a
  good minimum instead of bouncing around it.

Batch size, peak learning rate, and schedule shape are the three knobs that
most decide whether a run is fast, stable, or a smoking crater.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "The training loop and where the schedule sets the step size",
        diagram: `flowchart LR
  A["sample<br/>mini-batch"] --> B["forward pass<br/>compute loss"]
  B --> C["backward pass<br/>(backprop)<br/>gradients"]
  C --> D["optimizer step<br/>(SGD / Adam)"]
  D -->|"repeat: next step"| A
  E["LR schedule<br/>warmup then decay"] -->|"sets step size"| D`,
        caption:
          "One trip around the loop is a step: sample a batch, forward to the loss, backprop to gradients, then take an optimizer step. The learning-rate schedule (warmup then decay) feeds the optimizer the step size to use at that point in training. A full pass over the data is an epoch.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — noisy gradients that are still pointing the right way",
        markdown: `Why not just compute the gradient over the *whole* dataset each step? Because
that is astronomically expensive — a single exact gradient would mean a forward
and backward pass over trillions of tokens for **one** update. Mini-batching
trades exactness for throughput, and the trade is a bargain.

The key fact: a mini-batch gradient is a **noisy but unbiased estimate** of the
full-data gradient. "Unbiased" means that *on average*, over random batches, it
points in the same direction as the true gradient — each batch is a random
sample, so the expected gradient equals the full-data gradient. "Noisy" means
any single batch wobbles around that direction. Average enough steps and the
wobble cancels while the true signal accumulates. Larger batches average out
more noise per step (a cleaner estimate); smaller batches are cheaper and take
more, noisier steps for the same compute.

Surprisingly, the noise is not just a cost to tolerate — it often **helps
generalization**. The stochastic jitter nudges the optimizer out of sharp,
brittle minima and toward flatter regions that tend to generalize better to
unseen data. So the "cheap approximation" is doing double duty: it makes each
step affordable *and* it acts as a mild regularizer.

The **schedule** is the other half of why it works. Gradient descent only has
one real dial — how far to move — and the right distance changes over training.
Warmup keeps early, unreliable gradients from detonating; decay shrinks the
steps so late training converges into a minimum instead of rattling around it.
The optimizer decides the *direction*; the schedule governs the *distance*.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — reading three loss curves",
        markdown: `You train three models and log **train loss** and **validation loss** every few
epochs. Each table is one run. The diagnosis lives entirely in the *relationship*
between the two curves, not the absolute numbers.

**Run A**

| epoch | train_loss | val_loss |
|-------|-----------|----------|
| 1     | 3.10      | 3.14     |
| 3     | 2.42      | 2.48     |
| 6     | 2.05      | 2.11     |
| 10    | 1.88      | 1.95     |

Both curves fall together and level off, with only a small, stable gap.
**Diagnosis: healthy.** The model is learning and generalizing; the tiny
train/val gap is normal. If you want lower loss from here, scale the model, data,
or training length — not the LR.

**Run B**

| epoch | train_loss | val_loss |
|-------|-----------|----------|
| 1     | 3.30      | 3.33     |
| 3     | 3.02      | 3.05     |
| 6     | 2.94      | 2.96     |
| 10    | 2.91      | 2.93     |

Both losses are **high and flat**, and they sit right on top of each other.
**Diagnosis: underfitting.** The model can't even fit the training data — too
little capacity, too high regularization, too short a run, or a learning rate so
low it's barely moving. The train/val gap being tiny tells you overfitting is
*not* the problem. Fix: bigger model, longer training, or a higher LR.

**Run C**

| epoch | train_loss | val_loss |
|-------|-----------|----------|
| 1     | 2.80      | 2.85     |
| 3     | 1.90      | 2.00     |
| 6     | 1.20      | 2.05     |
| 10    | 0.60      | 2.40     |

Train loss keeps dropping toward zero while **val loss bottoms out and then
rises** — the gap widens every epoch. **Diagnosis: overfitting.** The model is
memorizing the training set instead of learning generalizable structure. The
best checkpoint was around epoch 3–6 (val ≈ 2.00), *before* val turned upward.
Fix: early stopping, more/augmented data, or stronger regularization.

**And a fourth failure mode — instability.** Not every bad run drifts; some
**diverge**. If the loss suddenly spikes upward, oscillates violently, or turns
to \`NaN\`, that is instability — usually the learning rate is too high, warmup was
too short, or a batch of corrupted/degenerate data hit the gradients. The fix is
mechanical: lower the peak LR, lengthen warmup, add gradient clipping, and check
your data.

The point: **underfit vs overfit vs unstable are three different pictures**, and
you read them off the *shape* and the *train–val gap*, not any single number.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things about training dynamics are genuinely remarkable and worth being
able to say out loud:

- **Loss is predictable across orders of magnitude.** Empirically, test loss
  falls as a smooth **power law** in model size, dataset size, and compute — no
  mysterious jumps, just a straight line on a log-log plot. That means you can
  fit the curve on a few small, cheap runs and **forecast** the final loss of a
  run 1000× bigger *before spending the money on it*. Very little else in
  engineering lets you extrapolate that confidently over that many orders of
  magnitude.

- **A handful of curves diagnose most problems.** You do not need to understand
  the internal state of a billion-parameter model to run it well. Two lines —
  train loss and validation loss — plus watching for spikes, tell you whether
  you're underfitting, overfitting, or diverging, and what knob to turn. A
  fantastically complex system exposes a tiny, legible dashboard.

- **The same loop scales from a laptop to a supercomputer.** The exact algorithm
  — sample a batch, forward, backprop, step — is identical on a toy model in a
  notebook and on a frontier run across thousands of GPUs. Nothing conceptually
  new appears at scale; you just add data, parameters, and compute, and the power
  laws keep holding.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain why a learning-rate schedule uses WARMUP early in training and DECAY late in training. What goes wrong if you skip each phase?",
        rubric: `A strong answer hits: (1) early in training the weights are random and gradients
are large/erratic, so a full-size step can blow the model up (loss spikes or
NaNs) — warmup ramps the LR up gently to stay stable; (2) late in training you
want to settle into a good minimum, so decay shrinks the steps to stop the model
bouncing around it and converge; (3) skipping warmup risks early divergence/
instability, and skipping decay leaves loss noisier and higher than it could be
because steps stay too large near the end. Bonus: notes the optimizer sets the
direction while the schedule sets the distance/step size.`,
        explanation:
          "Warmup protects against large, unreliable early gradients; decay lets late training converge into a minimum instead of rattling around it. The schedule governs step size over time; the optimizer governs direction.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it — scaling laws and compute-optimal training",
        markdown: `Once the loop is stable, the practical question is: given a fixed compute budget,
how big a model should you train, and on how much data? This is exactly what
**scaling laws** answer.

- **Kaplan et al. (2020)** measured test loss as you vary model parameters \`N\`,
  dataset size \`D\`, and compute \`C\`, and found each traces a clean **power law**:
  loss falls smoothly and predictably as any of the three grows (when the others
  aren't the bottleneck). Practically, this turns "how good will this run be?"
  into a curve you fit on small runs and extrapolate — you can budget a training
  run the way you'd budget a rocket, from a formula.

- **Chinchilla (Hoffmann et al., 2022)** refined the **compute-optimal** trade-off.
  For a *fixed* compute budget, there's a best split between making the model
  bigger (more \`N\`) and training it on more data (more \`D\`). Their finding: the
  models of the day were **oversized and undertrained** — too many parameters,
  too few tokens. The compute-optimal rule of thumb is to scale parameters and
  training tokens **roughly proportionally**, on the order of **~20 tokens per
  parameter**. A model with the right ratio beats a bigger model trained on too
  little data at the *same* compute cost.

Two disciplines follow directly:

- **Don't just make the model bigger.** If you 10× the parameters but keep the
  data fixed, you're marching into the undertrained regime Chinchilla warned
  about — you'll spend compute for less loss reduction than rebalancing toward
  more tokens would give.
- **Watch the right clock.** For a ~single-epoch LLM run, track loss vs *tokens
  seen* / steps, not epochs, and evaluate on a held-out set that the model never
  trains on — otherwise a falling train loss can hide the overfitting or data
  contamination that a validation curve would expose.

A caution on scope: these are **empirical** regularities fit over the ranges the
authors measured, not laws of nature. The ~20-tokens-per-parameter figure is a
useful heuristic, not a universal constant — it shifts with data quality,
architecture, and objective. Use it to *plan*, then verify with your own small
runs.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "During training you watch two curves. Train loss keeps falling steadily toward zero, but validation loss falls for a while, bottoms out, and then starts climbing — the gap between them widening every epoch. What is happening, and what's the best response?",
        choices: [
          "Underfitting — increase model size and train longer.",
          "Instability — lower the learning rate and add gradient clipping.",
          "Overfitting — the model is memorizing the training set; use the earlier checkpoint (early stopping), add data, or increase regularization.",
          "Healthy training — a rising validation loss with falling train loss is the expected signature of convergence.",
        ],
        answerIndex: 2,
        explanation:
          "Falling train loss with rising validation loss and a widening gap is the textbook overfitting signature — the model is memorizing rather than generalizing. The best checkpoint is at the validation minimum (early stopping); more/augmented data and stronger regularization also help. A rising val loss is never healthy.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — run the loop and forecast a bigger run (30–40 min, hands-on)",
        markdown: `Make the dynamics stick by producing curves and a Chinchilla estimate yourself.

1. **Train a small model and log two curves.** Take any small setup you can run
   quickly — a tiny char-level or token-level LM (Karpathy's \`nanoGPT\` is ideal),
   or even a small MLP on a toy dataset. Log **train loss** and **validation
   loss** every N steps. Plot both on the same axes.

2. **Provoke each failure mode on purpose.** Run three short variants and label
   each plot with its diagnosis:
   - *Underfit:* shrink the model (or cut training short) so both curves stay
     high and flat.
   - *Overfit:* train a larger model on a tiny slice of data for many epochs
     until val loss turns upward while train loss keeps falling.
   - *Unstable:* crank the peak learning rate (and/or remove warmup) until the
     loss spikes or goes to \`NaN\`. Then fix it by lowering the LR and adding
     warmup, and confirm the spike disappears.

3. **Do a compute-optimal sizing estimate.** Using the Chinchilla
   ~20-tokens-per-parameter heuristic, answer: for a **1B-parameter** model,
   roughly how many training tokens are compute-optimal? (Answer:
   \`1e9 x 20 = 2e10\` = **~20 billion tokens**.) Then flip it: if you only have
   **~5 billion tokens** of good data, what parameter count is that
   compute-optimally matched to? (Answer: \`5e9 / 20 = 2.5e8\` = **~250M
   parameters** — a *smaller* model trained on all your data beats a bigger,
   undertrained one at that budget.)

**Deliverable:** three labeled loss-curve plots (healthy/underfit/overfit or
unstable) with a one-line diagnosis each, plus your two Chinchilla estimates and
one sentence on what they imply for a project you might build (e.g. "we only have
~2B tokens of in-domain data, so a ~100M-param model is the right size — going
bigger would just waste compute").`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "Kaplan et al. — Scaling Laws for Neural Language Models",
        url: "https://arxiv.org/abs/2001.08361",
        author: "Jared Kaplan, Sam McCandlish, et al. (OpenAI), 2020",
        note: "The original power-law scaling paper: test loss falls as a smooth power law in parameters N, dataset size D, and compute C — the basis for forecasting large runs from small ones.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "Hoffmann et al. — Training Compute-Optimal Large Language Models (Chinchilla)",
        url: "https://arxiv.org/abs/2203.15556",
        author: "Jordan Hoffmann, et al. (DeepMind), 2022",
        note: "Refines the compute-optimal trade-off: for a fixed compute budget, scale parameters and training tokens ~proportionally (~20 tokens/parameter). Shows prior models were oversized and undertrained.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Training dynamics — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "Why is training done on random mini-batches instead of computing the exact gradient over the whole dataset each step?",
        choices: [
          "A mini-batch gradient is a biased estimate that deliberately points away from overfitting.",
          "The full-data gradient would be astronomically expensive per step; a mini-batch gradient is a noisy but unbiased estimate that is far cheaper, and the noise can even aid generalization.",
          "Whole-dataset gradients are impossible to compute because backprop only works on single examples.",
          "Mini-batches guarantee the loss decreases monotonically at every single step.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "A learning-rate schedule ramps the LR up over the first few thousand steps, then cosine-decays it toward zero. What is the purpose of the initial ramp-up (warmup)?",
        choices: [
          "To overfit the first few batches quickly so later batches converge faster.",
          "To keep large, erratic early gradients from destabilizing the still-random weights, easing the model into stable training.",
          "To decay the learning rate so the model can settle into a minimum at the end.",
          "To increase the batch size gradually as training proceeds.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "According to the Chinchilla (Hoffmann et al., 2022) result, what was wrong with the large language models that preceded it, at a fixed compute budget?",
        choices: [
          "They were undersized and overtrained — too few parameters trained on far too much data.",
          "They used the wrong optimizer, which scaling laws corrected.",
          "They were oversized and undertrained — too many parameters trained on too few tokens; compute-optimal training scales parameters and tokens roughly proportionally (~20 tokens/parameter).",
          "They violated the power-law relationship, so loss could not be forecast at all.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "You are handed a training run's train-loss and validation-loss curves. Explain how you would tell apart underfitting, overfitting, and instability from those two curves, giving the concrete signature of each and one fix. Then explain what scaling laws add on top of this — what they let you predict and why that is useful.",
        answerKey: {
          criteria: [
            {
              id: "diagnosis",
              description:
                "Correctly gives the signature of each failure mode: underfitting = train AND val both high/flat (small gap), fix with more capacity/longer training/higher LR; overfitting = train keeps falling while val rises, widening gap, fix with early stopping/more data/regularization; instability = loss spikes/oscillates/goes to NaN, fix with lower LR/longer warmup/gradient clipping.",
              points: 3,
            },
            {
              id: "train-val-gap",
              description:
                "Makes clear the diagnosis comes from the RELATIONSHIP between the two curves (the train–val gap and the curve shape), not any single absolute loss value — e.g. a small gap rules out overfitting even when loss is high.",
              points: 3,
            },
            {
              id: "scaling-laws",
              description:
                "Explains that scaling laws add a predictive power law: test loss falls smoothly with parameters/data/compute, so you can fit small cheap runs and forecast the final loss (and compute-optimal size) of a much larger run before spending the compute.",
              points: 2,
            },
          ],
          guidance:
            "Full marks require all three failure-mode signatures AND the point that diagnosis comes from the train–val relationship, not a single number, AND the forecasting value of scaling laws. Naming Kaplan/Chinchilla or the ~20-tokens-per-parameter heuristic is a nice detail but not required for full credit.",
        },
        points: 8,
      },
    ],
  },
};
