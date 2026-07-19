/**
 * SPINE LESSON — authored in full.
 *
 * "Lifecycle: pretrain → SFT → preference — from predictor to assistant."
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it. Matches the tokens-embeddings showcase in structure and rigor.
 *
 * The content lives here as typed `AuthoredBlock[]` + an `AuthoredAssessment`
 * so it is schema-checked at build time and inserted verbatim by the seed.
 */
import type { AuthoredLesson } from "../types";

export const lifecyclePretrainSftPreferenceLesson: AuthoredLesson = {
  topicSlug: "lifecycle-pretrain-sft-preference",
  title:
    "Lifecycle: pretrain → SFT → preference — from predictor to assistant",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Explain pretraining as self-supervised next-token prediction on raw text that builds broad capabilities and world knowledge.",
    "Describe supervised fine-tuning (SFT) on curated instruction/response pairs and what behaviour it changes.",
    "Summarize preference optimization (RLHF and DPO) and distinguish what each method does mechanically.",
    "Reason about which stage adds knowledge versus reshapes behaviour, and why capability and alignment are decoupled.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "From a text-completion engine to something that helps you",
        markdown: `Ask a *raw* base model — a giant network fresh off pretraining — "Explain
photosynthesis to a ten-year-old," and you are as likely to get *"Explain the
water cycle to a ten-year-old. Explain gravity to a ten-year-old."* as an actual
answer. It is not broken. It is doing exactly what it was trained to do: **continue
the text**. It saw your sentence and predicted what plausibly comes *next* in a
document — and lists of similar prompts are a very natural continuation.

The assistant you actually talk to is that same predictor after two more stages
of training that redirect it from *continuing* text to *responding* to you. The
whole modern pipeline is three stages: **pretraining**, **supervised fine-tuning
(SFT)**, and **preference optimization**. Understanding them separately is the
single most clarifying thing you can learn about how these systems are built —
because each stage changes something *different*.

We will follow four questions the whole way through — the framing you'll reuse
for every topic in atlas:

1. **What is it?** — the three stages, concretely, and what each one trains on.
2. **Why does it work?** — why the same objective, pointed at different data,
   produces a capable *and* helpful model.
3. **Why is it impressive?** — what this decoupling buys you.
4. **How would you use or evaluate it?** — the practical consequences: which
   stage to reach for, and how to tell them apart when a model misbehaves.

By the end you should be able to look at a model's failure and say, with reason,
*which stage* is responsible — a missing fact (pretraining), an ignored
instruction (SFT), or an unhelpful/unsafe style (preference).`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — three stages, one objective, three kinds of data",
        markdown: `Every stage is still a Transformer trained by backprop (see
\`neural-nets-backprop\`) to predict tokens (see \`language-modeling\`). What
changes between stages is the **data** and, in the last stage, the **loss**.

**1. Pretraining — build the capabilities.** The model is trained by
**self-supervised next-token prediction** over a huge, diverse corpus: web text,
books, code, references — trillions of tokens. "Self-supervised" means the labels
come free: for every position, the *next* token in the real document is the
target, so no human annotation is needed. Scanning that much text under that one
relentless objective is what installs **world knowledge, grammar, reasoning
patterns, and skills**. The output is a **base model**: enormously capable, but it
only knows how to *continue* text. It does not reliably follow instructions,
answer questions, or stay in a helpful-assistant role, because nothing ever asked
it to.

**2. Supervised fine-tuning (SFT) — teach the assistant format.** Take the base
model and keep training it — *same next-token objective* — but now on a much
smaller, **curated set of (instruction, response) demonstration pairs**, usually
wrapped in a chat template (a user turn, then the ideal assistant turn). By
predicting the tokens of high-quality demonstrations, the model learns the
**behaviour and format** of a helpful reply: read a request, produce a direct
answer, stop. This is where "text-completion engine" becomes "instruction
follower." Crucially, SFT mostly **elicits and shapes** abilities the base model
already has; it is not where most knowledge comes from.

**3. Preference optimization — align style, values, helpfulness.** SFT gets you a
model that *tries* to answer. Preference optimization makes it answer the way
**people actually prefer**: more helpful, more honest, less harmful. Instead of
single "correct" demonstrations, it trains on **comparisons** — humans (or a
model) see two candidate responses to the same prompt and mark which is better.
Two dominant methods turn those comparisons into weight updates:

- **RLHF (reinforcement learning from human feedback).** First train a separate
  **reward model** to predict which response a human would prefer. Then optimize
  the SFT model (the "policy") with a reinforcement-learning algorithm — usually
  **PPO** — to produce responses the reward model scores highly, held near the SFT
  model by a **KL-divergence penalty** so it doesn't drift into degenerate,
  reward-gaming gibberish.
- **DPO (direct preference optimization).** Skip the separate reward model and the
  RL loop entirely. DPO rewrites the objective as a **simple classification-style
  loss directly on the preference pairs**: increase the model's relative
  likelihood of the preferred response over the rejected one (regularised against
  a reference copy of the SFT model). Same goal as RLHF, far less machinery,
  and typically more stable.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "The training lifecycle: pretrain → SFT → preference",
        diagram: `flowchart LR
  A["raw web/text corpus<br/>(trillions of tokens)"] --> B["PRETRAIN<br/>next-token prediction<br/>(self-supervised)"]
  B --> C["base model<br/>(capable text continuer)"]
  C --> D["SFT<br/>instruction/response<br/>demonstrations"]
  D --> E["SFT model<br/>(follows instructions)"]
  E --> F["PREFERENCE OPT<br/>RLHF (reward model + PPO)<br/>or DPO (direct loss)"]
  G["human A vs B<br/>comparisons"] --> F
  F --> H["aligned assistant<br/>(helpful, honest, harmless)"]`,
        caption:
          "Each arrow is more training on the same weights. Pretraining installs broad capability from cheap self-supervised data; SFT reshapes behaviour toward the assistant format from a small curated set; preference optimization uses A-vs-B comparisons to align style and values. RLHF and DPO are two routes through the final stage with the same goal.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — one objective, redirected by data",
        markdown: `The surprising part is how *little* the machinery changes across the first two
stages. Pretraining and SFT run the **identical** learning rule — predict the
next token, backpropagate the error — and differ only in **which tokens you show
the model**. Pretraining shows it the whole messy internet, so it learns the
statistics of *everything*. SFT shows it a curated diet of ideal assistant turns,
so the same next-token machinery now puts its probability mass on *helpful-reply*
continuations. You are not teaching a capable model new facts in SFT; you are
teaching it **which of its many behaviours to default to**. That is why SFT works
with only thousands to tens of thousands of examples where pretraining needs
trillions of tokens: the capability is already in the weights, and you are just
selecting for it.

Preference optimization works because a single "gold" answer is often the wrong
target — for open-ended requests there are many acceptable responses, and what
separates a *good* one from a *bad* one is easier for a human to **judge by
comparison** than to **write from scratch**. "Which of these two is better?" is
cheap and reliable to collect; "produce the ideal response" is not. Both RLHF and
DPO exploit this: they convert a pile of pairwise "A beats B" judgments into a
gradient that pushes the model toward the preferred region of output space. The
**KL / reference-model regularisation** in both methods is load-bearing — it
keeps the aligned model anchored near the competent SFT model so it improves
*style and values* without forgetting how to actually do the task.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — one prompt, three models",
        markdown: `Take a single prompt and imagine passing it through the model at each stage of
its life. The outputs below are **illustrative** — hand-written to show the
*kind* of change each stage produces, not transcripts or benchmarks.

**Prompt:** \`"How do I make cold brew coffee at home?"\`

| Stage | What the model does | Illustrative output |
|-------|---------------------|---------------------|
| **Base (pretrained only)** | Continues the text like a document; may echo the question, drift, or produce a list of *related questions* | *"How do I make cold brew coffee at home? How do I make iced tea at home? How do I make ... Related searches: best coffee grinder, French press vs ..."* |
| **After SFT** | Recognises this as a request and tries to answer, plainly and directly | *"Coarsely grind coffee, combine with cold water at about a 1:8 ratio, steep 12–18 hours, then strain."* |
| **After preference optimization** | Answers helpfully, formatted for the reader, with useful hedging and safe, complete guidance | *"Here's a simple method: 1) Coarse-grind ~100g coffee. 2) Add 800ml cold water (a 1:8 ratio; adjust to taste). 3) Steep 12–18h in the fridge. 4) Strain through a filter. Tip: dilute the concentrate ~1:1 with water or milk. Steeping longer makes it stronger, not just more bitter."* |

**What each stage added, line by line:**

- **Pretraining → base:** the *knowledge* — it already "knows" what cold brew is,
  the ratios, the vocabulary. But its **behaviour** is to continue a document, so
  it never commits to answering *you*.
- **SFT → instruction follower:** the *format and intent* — it now maps
  "How do I…?" to "here is how," producing a direct, on-topic response. It has
  the facts and now uses them to help. Style is still plain and terse.
- **Preference optimization → aligned:** the *style, structure, and judgment* —
  clearer steps, a helpful tip, appropriate hedging ("adjust to taste"), nothing
  new about coffee. It **reshaped** the SFT answer toward what readers prefer;
  it did not add knowledge.

The through-line: **knowledge came from pretraining, obedience from SFT, and
polish/values from preferences.** Each stage moved a *different* dial.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things here are genuinely remarkable, and worth being able to articulate:

- **Capability and alignment are decoupled.** You pay the enormous cost of
  building raw ability **once** (pretraining is the expensive stage — vast data,
  huge compute), and then **cheaply reshape behaviour** on top of it with tiny
  datasets. The same base model can be turned into a terse coding assistant, a
  careful medical explainer, or a playful tutor by changing only the last two
  stages. The hard, costly part is amortised across every product built on it.

- **A little preference data redirects a giant model.** SFT and preference tuning
  use *orders of magnitude* less data than pretraining, yet they dominate how the
  model *feels* to use. Tens of thousands of comparisons can meaningfully steer a
  model with hundreds of billions of parameters — because they are *selecting
  among* existing behaviours, not installing new ones from nothing.

- **DPO showed the heavy RL machinery was optional.** RLHF's reward-model-plus-PPO
  pipeline is finicky and unstable. DPO proved you could get the *same alignment
  goal* with a **single classification-style loss** on the preference pairs — no
  separate reward model, no RL loop. A whole tier of engineering complexity turned
  out to be replaceable by rederiving the objective. That is the kind of
  simplification that reshapes a field.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain why supervised fine-tuning (SFT) needs only thousands of examples to turn a base model into an instruction follower, when pretraining needs trillions of tokens. What is SFT actually doing to the model?",
        rubric: `A strong answer hits: (1) both stages use the *same* next-token objective and
train the same weights, differing only in the data; (2) pretraining installs
broad capabilities/knowledge from scratch, which requires massive scale; (3) SFT
is not installing new knowledge — the capabilities are already in the base
model's weights, so SFT only needs to *select/elicit* the helpful-assistant
behaviour and format, which takes far less data. Bonus: notes the curated
(instruction, response) demonstrations teach the chat format and intent.`,
        explanation:
          "SFT is behaviour selection, not knowledge installation. The base model already 'knows' the content; SFT's small curated demonstrations just redirect its next-token defaults from 'continue the document' to 'answer the request' — a cheap change on capabilities that already exist.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `Knowing which stage does what is directly actionable when you build with or
diagnose a model:

- **Diagnose failures by stage.** A model that states a **wrong fact** or lacks a
  domain has a *pretraining* limitation — SFT and preference tuning won't reliably
  add missing knowledge (reach for retrieval/RAG or a stronger base instead). A
  model that **ignores your instruction** or breaks format points at *SFT*. A
  model that is technically correct but **unhelpful, evasive, verbose, or unsafe**
  points at the *preference/alignment* stage. Matching the symptom to the stage
  tells you which lever can actually fix it.

- **Choose the cheapest sufficient lever.** Want a model to adopt your product's
  tone, refuse certain requests, or always answer in JSON? That is usually
  **SFT** (and/or preference data), not a new pretrain — you are reshaping
  behaviour, not teaching new facts. Reserve the expensive options for genuine
  capability gaps.

- **RLHF vs DPO is an engineering trade-off.** DPO is simpler and more stable
  (no reward model, no RL loop) and is often the default for smaller teams. RLHF's
  separate reward model can be worth the complexity when you want a reusable
  scorer or online/iterative optimization. Both need **good comparison data** —
  the quality of your A-vs-B labels caps how well either can do.

- **Evaluate the right thing at the right stage.** Judge pretraining/base
  capability with knowledge and reasoning benchmarks; judge SFT with
  instruction-following and format-adherence checks; judge alignment with
  **human preference win-rates** (does a person prefer this model's answer to a
  baseline's?) plus **honesty and harmlessness** probes. A single aggregate score
  hides which stage is limiting you — separate the axes the way the training
  pipeline does.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "A model follows your instructions well and writes in a clean, helpful style, but it confidently reports a false statistic about a niche topic it clearly never saw enough of. Which stage is the limiting factor, and what actually helps?",
        choices: [
          "SFT — collect more instruction/response demonstrations so it learns to answer the question.",
          "Preference optimization — add more A-vs-B comparisons so it prefers the correct answer.",
          "Pretraining/knowledge — the fact isn't in the weights; more SFT or preference data won't reliably install it, so use retrieval (RAG) or a stronger base model.",
          "The KL penalty is too strong — lowering it will let the model recall the correct fact.",
        ],
        answerIndex: 2,
        explanation:
          "A missing/incorrect fact is a knowledge gap from pretraining. SFT and preference tuning reshape behaviour and style, not world knowledge, so they can't reliably add the fact. The real fixes are grounding the model with retrieval (RAG) or using a base model that actually saw the domain.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — probe the three stages (30–40 min, hands-on)",
        markdown: `Make the stage boundaries concrete by comparing models that differ in exactly
one stage of training.

1. **Base vs instruction-tuned, same family.** On Hugging Face, pick a model pair
   that shares a base but differs in post-training — e.g. a \`*-base\` (or
   pretrained-only) checkpoint and its \`*-instruct\`/\`*-chat\` sibling. Send both
   the **same** three prompts (a question, a "write X" request, and a multi-step
   instruction). Record how the base model *continues* the text versus how the
   instruct model *answers*. This is the SFT effect made visible.

2. **See what preference tuning adds.** Take the instruct model and, for one
   open-ended prompt (e.g. "Explain recursion to a beginner"), generate a few
   responses. Write down which you prefer and *why* (clarity, hedging, structure).
   You have just hand-labelled the kind of A-vs-B comparison RLHF/DPO trains on —
   note that your preferences are about **style/helpfulness**, rarely about new
   facts.

3. **Attribute a failure.** Find one case where a chat model fails, and classify
   it: missing knowledge (**pretraining**), ignored instruction/format (**SFT**),
   or unhelpful/unsafe style (**preference**). State which lever would fix it.

**Deliverable:** a short note (6–8 sentences) with one concrete base-vs-instruct
output difference you observed, one preference judgment you made (and the reason),
and one failure you attributed to a specific stage — with the fix you'd reach
for. Optionally skim the InstructGPT paper's figures to compare your observations
to how they describe SFT + RLHF changing the model.`,
      },
    },
    {
      kind: "citation",
      body: {
        label:
          "Ouyang et al. — Training language models to follow instructions with human feedback (InstructGPT)",
        url: "https://arxiv.org/abs/2203.02155",
        author: "Long Ouyang, Jeff Wu, Xu Jiang, et al. (OpenAI)",
        note: "The canonical write-up of the SFT-then-RLHF (reward model + PPO) pipeline, showing preference-aligned models are preferred over a much larger base model.",
      },
    },
    {
      kind: "citation",
      body: {
        label:
          "Rafailov et al. — Direct Preference Optimization: Your Language Model is Secretly a Reward Model (DPO)",
        url: "https://arxiv.org/abs/2305.18290",
        author: "Rafael Rafailov, Archit Sharma, Eric Mitchell, et al.",
        note: "Derives DPO: a simple classification-style loss on preference pairs that reaches RLHF's goal without a separate reward model or RL loop.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title:
      "Lifecycle: pretrain → SFT → preference — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "What is the training objective and data source during the pretraining stage?",
        choices: [
          "Reinforcement learning against a reward model trained on human comparisons.",
          "Self-supervised next-token prediction over a huge, diverse raw-text corpus.",
          "Supervised learning on a curated set of (instruction, response) demonstration pairs.",
          "A classification loss on pairs of preferred vs rejected responses.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "Which statement best captures the difference between SFT and preference optimization?",
        choices: [
          "SFT uses reinforcement learning; preference optimization uses next-token prediction.",
          "SFT teaches the model new world knowledge; preference optimization teaches it to follow instructions.",
          "SFT trains on single demonstration responses to instill the assistant format/behaviour; preference optimization trains on comparisons (A vs B) to align style, helpfulness, and values.",
          "SFT and preference optimization are the same stage under two different names.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "How does DPO differ mechanically from RLHF while pursuing the same goal?",
        choices: [
          "DPO trains a separate reward model and then runs PPO, whereas RLHF optimizes a direct loss.",
          "DPO skips the separate reward model and RL loop, optimizing a classification-style loss directly on the preference pairs (regularised against a reference model).",
          "DPO uses human demonstrations while RLHF uses human comparisons.",
          "DPO removes the need for any preference data by generating its own labels from scratch.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "A colleague says 'we just need more RLHF to make the model stop getting facts wrong.' Explain what each of the three stages (pretraining, SFT, preference optimization) actually changes about the model, and use that to argue why preference optimization is the wrong lever for a factual-knowledge problem.",
        answerKey: {
          criteria: [
            {
              id: "stages",
              description:
                "Correctly identifies what each stage changes: pretraining builds broad capabilities/world knowledge (self-supervised next-token prediction on raw text); SFT reshapes behaviour/format to follow instructions (same objective, curated demonstration pairs); preference optimization aligns style/values/helpfulness from A-vs-B comparisons.",
              points: 3,
            },
            {
              id: "decoupling",
              description:
                "Explains that preference optimization (and SFT) mostly reshape/select existing behaviours rather than adding new knowledge — capability comes from pretraining and is decoupled from alignment.",
              points: 3,
            },
            {
              id: "correct-lever",
              description:
                "Concludes that a missing/incorrect fact is a pretraining/knowledge gap, so more RLHF won't reliably fix it; the right levers are grounding via retrieval (RAG), a stronger base model, or otherwise getting the knowledge into context.",
              points: 2,
            },
          ],
          guidance:
            "Full marks require correctly attributing each stage's effect AND drawing the conclusion that factual gaps are a pretraining/knowledge issue, not something preference tuning fixes. Naming RAG or a stronger base as the fix earns the final criterion; RLHF-vs-DPO detail is not required.",
        },
        points: 8,
      },
    ],
  },
};
