/**
 * Evaluation — measuring what a model knows.
 *
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it. Authored against the tokens-embeddings showcase as the bar.
 *
 * Prereq is `transformers-gpt`; perplexity is referenced back to
 * `language-modeling`, and evaluating generations connects to sampling
 * (`training-vs-inference`) and to atlas's own strict, identity-blind grader.
 */
import type { AuthoredLesson } from "../types";

export const evaluationLesson: AuthoredLesson = {
  topicSlug: "evaluation",
  title: "Evaluation — measuring what a model knows",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Distinguish intrinsic evaluation (held-out perplexity / cross-entropy) from extrinsic evaluation (downstream task benchmarks), and say what each does and doesn't tell you.",
    "Describe how benchmark suites work and name their failure modes: contamination, gaming (Goodhart), format sensitivity, and saturation.",
    "Explain LLM-as-judge — pairwise or rubric scoring by a strong model — and its known biases (position, verbosity, self-preference).",
    "Argue why trustworthy evaluation is itself hard, and design a check that validates a metric against human labels.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "The number that hides the truth",
        markdown: `A team ships a new model and reports one headline figure: **74.3% on MMLU**,
up from the last version's 69.1%. A press cycle follows. But sit with the
question underneath it — *how would you actually know this model is better?* You
can watch its loss curve fall during training, but a falling loss is not the same
as "it can do your job." You can run it on a famous benchmark, but a benchmark is
a fixed exam — and fixed exams leak, get memorized, and get gamed. You can ask a
*stronger* model to grade the outputs, but then you have to trust *that* model's
judgment, which has biases of its own.

Evaluation is the part of the pipeline everyone quotes and almost nobody trusts
completely, for good reason. This lesson opens it up with the same four questions
we use for every atlas topic:

1. **What is it?** — intrinsic vs extrinsic evaluation, concretely.
2. **Why does it work?** — why a single held-out number tracks learning at all,
   and why task benchmarks add what it misses.
3. **Why is it impressive?** — how benchmarks turned "is it smart?" into
   something comparable across models.
4. **How would you use or evaluate it?** — contamination, Goodhart's law,
   LLM-as-judge, and how you validate a metric you want to trust.

By the end you should be able to look at a leaderboard score and immediately ask
the three questions that decide whether it means anything: *was the test in the
training data, is the metric being optimized directly, and who graded it?*`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — intrinsic vs extrinsic evaluation",
        markdown: `There are two fundamentally different things you can measure, and confusing them
is the root of most bad evaluation.

**Intrinsic evaluation** measures the training objective *directly*, on data the
model never saw. A language model is trained to predict the next token, so the
natural intrinsic metric is **held-out cross-entropy** — the average negative
log-probability the model assigns to the true next tokens of a fresh test set —
usually reported as its exponential, **perplexity** (recall this from
\`language-modeling\`). Lower perplexity means the model is a *better predictor of
text*. It is cheap, continuous, and requires no labels or human judgment: you
just run the model over held-out text and read off a number.

**Extrinsic evaluation** measures usefulness on a downstream **task** you
actually care about, via a **benchmark** — a fixed dataset of items with known
correct answers, plus a scoring rule. A few canonical ones:

- **MMLU** — 57 subjects of multiple-choice questions (law, medicine, math,
  history…) testing broad knowledge and reasoning. Score = accuracy.
- **GSM8K** — grade-school math word problems requiring multi-step arithmetic.
  Score = fraction with the correct final answer.
- **HumanEval** — Python programming problems graded by *running* the generated
  code against hidden unit tests. Score = pass@k.

The crucial gap: **low perplexity does not directly tell you task ability.** A
model can be an excellent next-token predictor and still get math wrong, and two
models with nearly identical perplexity can score very differently on GSM8K.
Intrinsic is cheap but indirect; extrinsic is what users care about but is
**noisy, expensive, and gameable**. Serious evaluation uses both and trusts
neither blindly.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "A taxonomy of model evaluation",
        diagram: `flowchart TD
  E["Evaluation<br/>&quot;how good is the model?&quot;"] --> I["Intrinsic<br/>measures the objective directly"]
  E --> X["Extrinsic<br/>measures downstream usefulness"]
  I --> P["held-out perplexity<br/>/ cross-entropy loss<br/>(lower = better predictor)"]
  X --> B["benchmark suites<br/>knowledge / reasoning / code<br/>(MMLU, GSM8K, HumanEval)"]
  X --> H["human evaluation<br/>(preference / rubric)"]
  X --> J["LLM-as-judge<br/>(pairwise or rubric)"]
  P --> C1["caveat: indirect<br/>tracks text, not task ability"]
  B --> C2["caveats: contamination<br/>gaming / Goodhart<br/>format sensitivity, saturation"]
  J --> C3["caveats: position bias<br/>verbosity bias, self-preference<br/>must be validated vs humans"]`,
        caption:
          "Evaluation splits into intrinsic (measure the modeling objective directly, via perplexity) and extrinsic (measure downstream usefulness, via benchmarks, human eval, or an LLM judge). Every branch carries its own failure modes — the caveats hanging off each leaf are the whole reason evaluation is hard.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — and why one number isn't enough",
        markdown: `**Why intrinsic works at all.** Cross-entropy on held-out text is a proper
scoring rule: it is minimized *only* by reporting the true next-token
distribution. So a model can only lower its held-out perplexity by genuinely
capturing more real structure in language — grammar, facts, discourse, some
reasoning. That is why the loss curve is trustworthy as a *training* signal and
why scaling laws are stated in terms of it. It is a clean, label-free thermometer
for "is this model learning."

But a thermometer is not a diagnosis. Perplexity is an **average over all
tokens**, so it rewards being fluent on the vast, easy majority of text (function
words, boilerplate) and barely notices the rare, hard tokens where reasoning
actually lives. A model can shave perplexity by getting better at predicting
*"the"* and *"of"* while its ability to solve a math problem — which hinges on a
handful of decisive tokens — is invisible in the average. Perplexity also can't
be compared across different tokenizers or corpora, and it says nothing about
whether the model *follows instructions* or *is safe*.

**Why extrinsic adds what's missing.** A benchmark isolates a capability and
attaches a **verifiable correct answer**, so it measures the thing users pay for:
did it get the right answer, run the passing code, pick the right multiple-choice
letter. That directness is exactly its strength — and, as we'll see, exactly its
weakness, because *anything with a fixed correct answer can be memorized or
optimized against.* The two families are complementary: intrinsic tells you the
model is learning to model text; extrinsic tells you whether that translated into
a capability you care about. Neither alone is enough.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — same perplexity, different scores; and a judge that flips",
        markdown: `Two illustrative scenarios that make the gaps concrete. Numbers are invented to
show the *mechanism*, not measured results.

**1. Equal perplexity, unequal task ability.**

Two models are evaluated on the same held-out corpus and the same GSM8K subset:

| model | held-out perplexity | GSM8K accuracy |
|-------|---------------------|----------------|
| A | 8.9 | 34% |
| B | 8.8 | 61% |

Model B is a *hair* better at predicting generic text (8.8 vs 8.9 — noise, for
practical purposes) yet solves nearly **twice** as many math problems. How?
Multi-step arithmetic depends on a few decisive tokens per problem; getting those
right barely moves an average taken over thousands of ordinary tokens. **The
intrinsic number could not have told you B was the better reasoner.** You had to
run the extrinsic task.

**2. An LLM judge flips its verdict on format alone.**

We ask a strong model to pick the better of two answers to the same question. The
answers' *content quality* is held fixed; we only change presentation.

| trial | what changed | judge picks |
|-------|--------------|-------------|
| baseline | answer X first, answer Y second (equal length) | X |
| swap order | answer Y first, answer X second | Y |
| pad length | X unchanged; Y rewritten 3× longer, same facts | Y |

In the first two rows the judge simply favours whichever answer it read **first**
(position bias); the verdict flipped when only the *order* changed. In the third,
it favours the **longer** answer despite no new information (verbosity bias). A
grader whose output changes when the content did not is measuring the wrong thing.

Both scenarios point the same way: a single evaluation number is only meaningful
once you know what could have moved it *without* the underlying ability changing.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things about modern evaluation are genuinely notable, and worth being able
to state precisely:

- **It turned "is it smart?" into something measurable and comparable.** Before
  standardized suites, model comparisons were vibes and cherry-picked demos.
  Benchmarks like MMLU gave the field a *shared, reproducible ruler*: run any
  model on the same fixed items with the same scoring rule and you get numbers you
  can rank, plot against scale, and reproduce. That comparability is what makes
  scaling laws and leaderboards possible at all.

- **Some tasks can be graded with zero human judgment.** HumanEval doesn't ask an
  opinion — it *executes* the generated code against hidden unit tests, so
  correctness is a fact, not a preference. GSM8K checks a final number. This
  automatic, objective grading scales to millions of examples and removes the
  grader as a source of bias entirely — the gold standard when a task admits it.

- **A cheap intrinsic signal quietly tracks the whole enterprise.** One label-free
  number — held-out perplexity — falls smoothly and predictably as you add
  parameters, data, and compute. That single continuous quantity is what let the
  field forecast that bigger models would be better *before training them*, which
  is a remarkable amount of leverage from one average over a test set.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain why a model can achieve lower held-out perplexity than a rival yet score *worse* on GSM8K. Name the property of perplexity that makes this possible.",
        rubric: `A strong answer hits: (1) perplexity is an *average* (negative log-prob) over
*all* tokens of held-out text, so it is dominated by the easy, frequent majority
of tokens; (2) task ability like multi-step math depends on a small number of
*decisive* tokens per problem, whose correctness barely moves that average; (3)
therefore intrinsic perplexity is only an *indirect* proxy for task ability, and
you must run the extrinsic benchmark to measure it. Bonus: notes perplexity also
isn't comparable across tokenizers and says nothing about instruction-following
or safety.`,
        explanation:
          "Perplexity rewards fluency on the vast easy majority of tokens; reasoning lives in a few hard tokens the average washes out. Lower perplexity means 'better text predictor,' not 'better at your task' — the two can diverge, so extrinsic evaluation is not optional.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `Once you actually rely on a benchmark number, four failure modes decide whether
it means anything:

- **Data contamination.** If test items (or near-duplicates) leaked into the
  pretraining corpus, the model can *recall* answers rather than *derive* them,
  inflating the score. Because pretraining corpora are enormous web scrapes and
  popular benchmarks are all over the web, contamination is the default hazard,
  not the exception. Defenses: hold out freshly-created test sets, check for
  n-gram overlap between test items and training data, and prefer benchmarks
  released *after* a model's training cutoff.

- **Gaming / Goodhart's law.** *"When a measure becomes a target, it ceases to be
  a good measure."* Once a benchmark drives promotions, papers, and marketing,
  teams optimize *to the benchmark* — tuning prompts and formats, training on
  similar data — and the score rises without the underlying capability rising
  with it. A high number on a heavily-targeted benchmark tells you less over time,
  not more.

- **Format / prompt sensitivity.** The *same* model can swing several points on
  MMLU depending on the answer template, few-shot examples, or how choices are
  presented. If a "gain" disappears under a different prompt, you measured the
  harness, not the model — always fix and report the exact eval setup.

- **Saturation and narrow coverage.** When top models cluster near 90%+, remaining
  headroom is mostly noise and label errors, and the benchmark stops
  discriminating. And any single suite covers a *sliver* of real use — acing MMLU
  says nothing about whether the model is good at *your* tickets, *your* codebase,
  *your* tone.

**LLM-as-judge** is the pragmatic answer for open-ended outputs where no
gold answer exists: have a strong model score a response against a rubric, or pick
the better of two (pairwise). It's cheap, scales, and correlates with human
preference on many tasks. But it carries characteristic biases — **position
bias** (favouring the first or second answer presented), **verbosity bias**
(preferring longer answers), and **self-preference** (favouring outputs in its
own style) — and it can be *fooled*. So a judge is not ground truth: you must
**validate it against human labels** (measure judge-human agreement, randomize
answer order, control for length) before trusting its verdicts. This is precisely
why atlas keeps its own quiz grader **strict and identity-blind** — it sees only
the question, rubric, and answer text, never the learner's name, streak, or
history, so it can't be swayed by who is asking. Evaluating open-ended
*generations* also interacts with decoding: temperature and sampling
(\`training-vs-inference\`) change the outputs you're scoring, so pin them too.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "A benchmark that a lab has been optimizing hard against for a year shows their new model at 96%, but customers report no improvement on real tasks. Which explanation is MOST consistent with careful evaluation practice?",
        choices: [
          "Perplexity must have gone up, which always cancels out benchmark gains.",
          "Goodhart's law plus likely contamination: a heavily-targeted, possibly-leaked benchmark near saturation stops tracking the real capability, so the score rose without usefulness rising with it.",
          "LLM-as-judge position bias inflated the multiple-choice accuracy score.",
          "The benchmark is objective and executable, so a 96% guarantees the model improved and the customers are mistaken.",
        ],
        answerIndex: 1,
        explanation:
          "When a measure becomes a target it stops being a good measure; add contamination and saturation and a high number is exactly what you'd expect without real gains. Position bias (choice C) applies to an LLM judge, not to fixed multiple-choice scoring, and 'the metric can't be wrong' (D) is the mistake to avoid.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — build a tiny eval and stress-test its trust (30–40 min, hands-on)",
        markdown: `Do this with a real model API to feel where evaluation breaks.

1. **Measure both kinds.** Pick a small task with known answers (e.g. 20 GSM8K
   problems, or 20 MMLU items). For a couple of models you can call:
   - Compute an **extrinsic** score: fraction of final answers correct. Grade it
     *programmatically* by string-matching the final answer — no judgment needed.
   - If your API exposes token log-probabilities, compute an **intrinsic** proxy:
     average negative log-prob over a short held-out text. Note whether the
     ranking by perplexity matches the ranking by task accuracy — or diverges,
     as in the worked example.

2. **Probe format sensitivity.** Re-run the *same* MMLU items with two different
   answer templates (e.g. \`"Answer: (B)"\` vs \`"The correct option is B"\`, or a
   different few-shot ordering). Record how many points the score moves with the
   *model unchanged*. This is the size of the harness effect you must control for.

3. **Catch an LLM judge cheating.** Take 8 question/answer pairs with no gold
   answer. Ask a strong model to pick the better of two responses. Then re-run
   each comparison (a) with the two answers in **swapped order**, and (b) with one
   answer **padded to ~3× length** but no new content. Count how often the verdict
   flips. You have just measured **position bias** and **verbosity bias** on your
   own judge.

**Deliverable:** a short note (6–10 sentences) reporting your extrinsic scores,
the format-sensitivity swing in points, and your judge's flip rate under order-
swap and padding. State one concrete rule you'd adopt before trusting an eval
number for a real decision (e.g. "randomize answer order and fix the prompt
template, or the judge's verdict isn't evidence").`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "Hendrycks et al. — Measuring Massive Multitask Language Understanding (MMLU)",
        url: "https://arxiv.org/abs/2009.03300",
        author: "Dan Hendrycks, Collin Burns, Steven Basart, Andy Zou, Mantas Mazeika, Dawn Song, Jacob Steinhardt",
        note: "Introduces the 57-subject multiple-choice benchmark that became the standard ruler for broad knowledge and reasoning — and the canonical case study in contamination and format sensitivity.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "Zheng et al. — Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena",
        url: "https://arxiv.org/abs/2306.05685",
        author: "Lianmin Zheng, Wei-Lin Chiang, Ying Sheng, et al.",
        note: "Establishes LLM-as-judge as a scalable evaluation method, measures its agreement with human preference, and names its biases (position, verbosity, self-preference) and how to control for them.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Evaluation — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "Which pairing correctly matches an evaluation type to what it measures?",
        choices: [
          "Intrinsic = accuracy on MMLU; extrinsic = held-out perplexity.",
          "Intrinsic = held-out cross-entropy/perplexity (the modeling objective directly); extrinsic = downstream task benchmarks users care about.",
          "Intrinsic = human preference ratings; extrinsic = the training loss curve.",
          "Intrinsic and extrinsic both measure next-token log-probability; they differ only in dataset size.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "Data contamination inflates a benchmark score primarily because…",
        choices: [
          "the test set is too small to be statistically reliable.",
          "test items (or near-duplicates) leaked into the pretraining corpus, so the model can recall answers instead of deriving them.",
          "the answer template used at eval time doesn't match the training format.",
          "the LLM judge prefers longer answers regardless of correctness.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "You use a strong model to grade open-ended answers and notice its verdict changes when you swap which answer is shown first. This is an example of…",
        choices: [
          "Goodhart's law — the metric became a target.",
          "benchmark saturation — scores cluster too near the ceiling.",
          "position bias — a known LLM-as-judge failure mode that must be controlled by randomizing order and validating against human labels.",
          "data contamination — the grading rubric was in the training set.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "A lab reports its new model at 88% on a popular benchmark, up from 71%, and claims it is now clearly more capable. Lay out how you would decide whether that number is trustworthy: name at least three specific things you'd check and why each matters, and explain how intrinsic vs extrinsic evaluation and LLM-as-judge (if any grading was subjective) fit into your reasoning.",
        answerKey: {
          criteria: [
            {
              id: "benchmark-failure-modes",
              description:
                "Names concrete benchmark trust checks — contamination (was the test in the training data / released after the cutoff?), gaming/Goodhart (has the lab been optimizing to this benchmark?), and format/prompt sensitivity or saturation — and says why each can inflate the number without real capability gain.",
              points: 3,
            },
            {
              id: "intrinsic-vs-extrinsic",
              description:
                "Correctly frames the score as extrinsic (task benchmark) and notes what it does and doesn't tell you vs an intrinsic signal like perplexity — e.g. that a benchmark measures a narrow sliver of real use and one number can't confirm broad capability, so you'd corroborate across tasks / against your own workload.",
              points: 3,
            },
            {
              id: "judge-validation",
              description:
                "If any grading was subjective, notes that an LLM-as-judge must be validated against human labels and controlled for position/verbosity/self-preference bias before its verdicts count as evidence (or, for an objective benchmark, notes that automatic executable/exact-match grading removes the grader as a bias source).",
              points: 2,
            },
          ],
          guidance:
            "Full marks require at least three distinct benchmark failure modes with reasons AND the intrinsic-vs-extrinsic framing. The judge-validation point earns full credit either by explaining human-label validation and bias control for subjective grading, or by correctly noting that objective executable/exact-match grading sidesteps grader bias. Reward concrete, mechanism-level reasoning over generic skepticism.",
        },
        points: 8,
      },
    ],
  },
};
