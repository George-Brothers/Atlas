/**
 * "Language modeling — predicting the next token."
 *
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it. Authored to match the tokens-embeddings showcase reference.
 *
 * Builds directly on `tokens-embeddings` (the vocabulary a language model puts
 * a distribution over IS the tokenizer's vocabulary) and sets up
 * `neural-nets-backprop` (the cross-entropy loss defined here is exactly what
 * gradients descend).
 */
import type { AuthoredLesson } from "../types";

export const languageModelingLesson: AuthoredLesson = {
  topicSlug: "language-modeling",
  title: "Language modeling — predicting the next token",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Frame language modeling as next-token prediction: a probability distribution over the whole vocabulary given the preceding context, with the autoregressive factorization P(sequence) = ∏ P(token_t | tokens_<t).",
    "Explain why the training objective — maximize the probability of the true next token — is identical to minimizing cross-entropy loss, the average negative log-likelihood.",
    "Define perplexity as exp(cross-entropy) and interpret it as the effective branching factor; convert between nats, bits, and perplexity.",
    "Explain why next-token prediction is self-supervised — the label comes free from the text — and why that is what lets it scale to trillions of tokens.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "One dumb objective",
        markdown: `Here is the entire training objective of a large language model, stated
honestly: **guess the next token, over and over, and get punished in proportion
to how surprised you were by the real one.** That's it. No grammar rules, no
labelled examples of "correct" answers, no human writing down what a good
sentence looks like. You show the model text, hide the next token, ask it to bet
on what comes next, and score the bet.

The astonishing part is what falls out of that. To get good at guessing the next
token, a model is *forced* to pick up grammar (so its guesses are well-formed),
facts (so \`The capital of France is\` continues sensibly), translation, and a
surprising amount of reasoning — all as **side effects** of one relentlessly
simple game.

We'll follow the same four questions you'll reuse for every topic in atlas:

1. **What is it?** — a probability distribution over the next token, concretely.
2. **Why does it work?** — why "minimize surprise" is a training signal at all.
3. **Why is it impressive?** — what one scalar objective buys you.
4. **How would you use or evaluate it?** — perplexity, and what it does and
   doesn't tell you.

By the end you should be able to explain why the loss and the perplexity are
really the *same number* wearing different clothes, and why the "label" in this
setup is completely free.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — a distribution over the next token",
        markdown: `A **language model** is a function that takes a sequence of context tokens and
returns a **probability distribution over the entire vocabulary** for what comes
next. The vocabulary is the tokenizer's vocabulary from the previous topic —
the same ~100,000 subword slots. So concretely, at every position:

- **Context tokens in.** The tokens seen so far, e.g. \`The\`, \` cat\`, \` sat\`.
- **A logit per vocab entry out.** The network's final layer produces one raw
  score — a **logit** — for *every* token in the vocabulary. If the vocab has
  100,000 entries, that's a vector of 100,000 numbers.
- **Softmax turns logits into probabilities.** Softmax exponentiates each logit
  and normalizes so the whole vector is non-negative and sums to 1. Now you have
  a genuine probability distribution: \`P(next = " on") = 0.31\`,
  \`P(next = " down") = 0.12\`, and so on across all 100,000 tokens.
- **Read off or sample.** To generate, you pick a token from that distribution
  — greedily (the argmax) or by sampling (optionally sharpened/flattened by a
  temperature). Then you **append it to the context and repeat.** That feedback
  loop is what **autoregressive** means: each new token is conditioned on every
  token before it, including the ones the model just produced.

This gives the model's core claim about a whole sequence. The probability of a
sequence factorizes, exactly, by the chain rule of probability into a product of
next-token predictions:

\`\`\`
P(t_1, t_2, ..., t_n) = P(t_1) · P(t_2 | t_1) · P(t_3 | t_1, t_2) · ...
                      = ∏_t  P(t_t | t_<t)
\`\`\`

Nothing is approximated in that factorization — it is just the chain rule. The
model's only job is to estimate each conditional \`P(t_t | t_<t)\` well.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "One autoregressive step: context → distribution → next token",
        diagram: `flowchart LR
  A["context tokens<br/>&quot;The cat sat&quot;"] --> B["model<br/>(Transformer)"]
  B --> C["logits<br/>one per vocab entry<br/>(length = vocab)"]
  C --> D["softmax"]
  D --> E["distribution over vocab<br/>P(next token)"]
  E --> F["pick / sample<br/>next token &quot; on&quot;"]
  F -->|"append, repeat"| A`,
        caption:
          "The context is mapped to one logit per vocabulary entry; softmax turns those logits into a probability distribution over the whole vocab; you read off or sample the next token, append it to the context, and repeat. The loop back to the context is what makes generation autoregressive — every token is conditioned on all the tokens before it.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — surprise is a gradient",
        markdown: `Why is "predict the next token" a thing you can actually *train* on? Because it
gives you a smooth, differentiable measure of how wrong the model is at every
single position, and you have that measurement for free.

At each position the text tells you the **true** next token. The model gave that
token some probability \`p\`. The **loss** for that position is the negative log
of that probability:

\`\`\`
loss = -log p(true token)
\`\`\`

This is the **cross-entropy loss**, and it behaves exactly the way a good
scoreboard should. If the model was confident and right (\`p\` near 1),
\`-log p\` is near 0 — almost no penalty. If it put the true token at \`p = 0.5\`,
the penalty is \`-log 0.5 ≈ 0.69\` nats. If it was confident and *wrong*
(\`p\` near 0), \`-log p\` shoots toward infinity — a brutal penalty for ruling out
what actually happened. Average this over every position in the training data
and you get the model's cross-entropy loss:

\`\`\`
CE = (1/N) · Σ_t  −log p(true token_t)   =   average negative log-likelihood
\`\`\`

Maximizing the probability the model assigns to the real text (**maximum
likelihood**) and minimizing this cross-entropy are the *same optimization* —
because \`log\` is monotonic and the sign is flipped. Minimizing CE is therefore
just "make the real continuation as likely as possible."

And here is the load-bearing point: **the label is free.** The "correct answer"
at each position is simply the token that literally comes next in the text you
already have. Nobody has to annotate anything. This is what **self-supervised**
means — the supervision signal is manufactured from the raw data itself. Every
sentence on the internet is simultaneously millions of tiny labelled prediction
problems. That's why the approach scales to **trillions** of tokens: your only
real constraint is how much text and compute you can feed it, not how much
humans can label. (Where those gradients go — how \`−log p\` actually reshapes
the weights — is the \`neural-nets-backprop\` topic.)`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — from predictions to cross-entropy to perplexity",
        markdown: `Let's compute the whole chain on a **tiny 4-token vocabulary**:
\`[the, cat, sat, mat]\`. We'll score the model on the two-token continuation of
\`the cat sat\` — i.e. predicting \` cat\` (after \`the\`) and \` sat\`
(after \`the cat\`). Suppose the model output these distributions:

| position | context | model's distribution over [the, cat, sat, mat] | true token | p(true) |
|----------|---------|-----------------------------------------------|------------|---------|
| 1 | \`the\` | [0.2, **0.5**, 0.2, 0.1] | \`cat\` | 0.5 |
| 2 | \`the cat\` | [0.1, 0.2, **0.5**, 0.2] | \`sat\` | 0.5 |

Each row is a valid distribution (non-negative, sums to 1).

**1. Per-token loss (surprisal).** Loss is \`−ln p(true)\`, in nats:

\`\`\`
position 1:  −ln(0.5) = 0.6931 nats
position 2:  −ln(0.5) = 0.6931 nats
\`\`\`

**2. Cross-entropy = the average.**

\`\`\`
CE = (0.6931 + 0.6931) / 2 = 0.6931 nats  (= 1 bit, since ln 2 = 0.6931)
\`\`\`

**3. Sequence likelihood is the product** (the autoregressive factorization):

\`\`\`
P(cat, sat | the) = 0.5 × 0.5 = 0.25
neg log-likelihood = −ln(0.25) = 1.3863 nats  ->  per token 1.3863/2 = 0.6931 ✓
\`\`\`

Same number — averaging per-token \`−log p\` and taking the mean negative
log-likelihood of the whole product are identical by construction.

**4. Perplexity = exp(cross-entropy).**

\`\`\`
perplexity = exp(CE) = exp(0.6931) = 2.0
\`\`\`

**Reading it:** a perplexity of **2** means that, on average, the model is as
uncertain as if it were choosing uniformly among **2** equally-likely tokens —
its *effective branching factor* is 2. Compare the baseline: a model that knew
nothing and guessed **uniformly** over this 4-token vocab would assign
\`p = 0.25\` every step, giving \`CE = −ln(0.25) = ln 4 = 1.3863\` nats and
\`perplexity = exp(1.3863) = 4\`. So our model has cut the effective number of
choices from 4 down to 2 — it has genuinely learned something. A **perfect**
model that put \`p = 1\` on every true token would score \`CE = 0\` and
\`perplexity = 1\` (no uncertainty at all). Lower is always better, and the floor
is 1.

Note the unit-agnostic bridge: if you measure the loss in **bits** (log base 2)
instead of nats, perplexity is \`2^CE\` rather than \`e^CE\` — here \`CE = 1\` bit
and \`2^1 = 2\`, the same answer. Perplexity is just the loss re-expressed as a
count of choices.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things about next-token prediction are genuinely remarkable, and worth
being able to say out loud:

- **Capabilities are side effects of one objective.** Nobody trains a model to
  translate, or to know the boiling point of water, or to balance parentheses in
  code. Those show up because they *help* predict the next token in text that
  contains translations, facts, and code. A single, almost embarrassingly simple
  loss — minimize surprise — turns out to be a general-purpose lever on grammar,
  world knowledge, and reasoning, once you apply it at enough scale.

- **The label is free, so the data is essentially unlimited.** Because the
  supervision is self-generated (the next token is its own label), *any* raw
  text is training data with no annotation step. This is the crucial difference
  from supervised learning, where labelled data is the bottleneck. It is why
  language models could scale to trillions of tokens while hand-labelled datasets
  stalled in the millions.

- **One scalar tracks everything.** Progress collapses into a single number —
  cross-entropy loss, equivalently perplexity. It is comparable across model
  sizes and training runs, it decreases smoothly and predictably with scale
  (this regularity is what "scaling laws" describe), and it needs no human in the
  loop to compute. A dashboard with one falling curve tells you the model is
  getting better at *everything at once*.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain why next-token prediction is called *self-supervised*, and why that property — not the model architecture — is the main reason it scales to trillions of tokens.",
        rubric: `A strong answer hits: (1) at each position the "label" (the correct next token)
is simply the token that already comes next in the raw text, so it requires no
human annotation; (2) this means any unlabelled text is instantly training data —
every sentence is millions of free prediction problems; (3) because labelling is
the usual bottleneck in supervised learning, removing it lets the data (and thus
training) scale to essentially the whole internet, limited by compute rather than
by annotators. Bonus: contrasts with supervised learning where labels are scarce
and expensive.`,
        explanation:
          "Self-supervised = the supervision signal is manufactured from the data itself (the next token is its own label). Removing the human-labelling bottleneck is exactly what makes trillions of tokens feasible.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `Perplexity is the workhorse metric for language models, but it is sharp-edged.
Use it well and read it carefully:

- **Perplexity is exp of the average loss — nothing more.** \`perplexity = e^CE\`
  (or \`2^CE\` in bits). It is the effective branching factor: "on average, how
  many equally-likely tokens is the model choosing among?" Lower is better; 1 is
  perfect. It is the natural way to report the loss to humans, because "the model
  is as confused as a fair 8-sided die" is more legible than "CE = 2.08 nats."

- **It is only comparable under the same tokenizer.** Perplexity is
  *per token*, so a model whose tokenizer splits text into more, smaller tokens
  can post a lower perplexity without being a better model — each token is an
  easier guess. Never compare perplexities across different vocabularies or
  tokenizations; the number is meaningless out of that context.

- **Always evaluate on held-out text.** Perplexity on data the model trained on
  is optimistic to the point of useless — the model can partly memorize.
  Measure on a **held-out** set the model never saw, or you are measuring recall,
  not generalization.

- **Low perplexity is necessary, not sufficient.** A model can have excellent
  perplexity and still be unhelpful, biased, or dishonest — because perplexity
  rewards predicting the *training distribution*, which includes plenty of text
  you don't actually want reproduced. This is exactly why raw pretraining is
  followed by instruction-tuning and preference optimization, and why real
  systems add **task** evaluations (accuracy on benchmarks, human preference,
  factuality checks) on top of perplexity. Perplexity tells you the model models
  language well; it does not tell you the model is good.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "Model A reports a per-token perplexity of 12 and Model B reports 18, but they use different tokenizers. Model A's tokenizer splits text into noticeably more, smaller tokens. What can you correctly conclude?",
        choices: [
          "Model A is the better language model, because lower perplexity always means better.",
          "Almost nothing about which model is better — perplexity is per-token and only comparable under the same tokenizer, and finer token splits can lower perplexity artificially.",
          "Model B is better, because higher perplexity means it is handling harder tokens.",
          "The perplexities can be directly averaged to get an overall score of 15.",
        ],
        answerIndex: 1,
        explanation:
          "Perplexity is a per-token quantity, so it is only comparable when the tokenization is held fixed. A tokenizer that produces more, smaller tokens makes each next-token guess easier and can post a lower perplexity without the underlying model being better. Compare like-for-like (same tokenizer, same held-out set) or fall back to task metrics.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — compute a real cross-entropy and perplexity (30 min, hands-on)",
        markdown: `Make the loss ↔ perplexity identity concrete with real numbers.

1. **Score a sequence by hand-in-code.** Load any small causal LM (e.g. a GPT-2
   size model via Hugging Face \`transformers\`), feed it a short sentence, and
   pull out the model's probability for each *actual* next token:

   \`\`\`python
   import torch
   from transformers import AutoModelForCausalLM, AutoTokenizer

   tok = AutoTokenizer.from_pretrained("gpt2")
   model = AutoModelForCausalLM.from_pretrained("gpt2").eval()

   text = "The cat sat on the mat."
   ids = tok(text, return_tensors="pt").input_ids
   with torch.no_grad():
       logits = model(ids).logits           # (1, T, vocab)
   # align: logits at position t predict token t+1
   logp = torch.log_softmax(logits[0, :-1], dim=-1)
   true = ids[0, 1:]
   token_nll = -logp[range(len(true)), true]   # −log p(true) per position
   ce = token_nll.mean()
   print("cross-entropy (nats):", ce.item())
   print("perplexity:", torch.exp(ce).item())
   \`\`\`

2. **Verify the identity yourself.** Confirm that \`exp(mean(token_nll))\` equals
   the printed perplexity, and that summing \`token_nll\` and exponentiating the
   *mean* matches. Change one word to something surprising (e.g. "The cat sat on
   the **quasar**.") and watch that token's \`−log p\` spike and the perplexity
   rise.

3. **Held-out vs seen.** Score a sentence you invented versus a famous line the
   model very likely saw in training (e.g. the opening of a well-known book).
   Note how much lower the perplexity is on the memorized text — this is exactly
   why evaluation must be on held-out data.

**Deliverable:** a short note (5–8 sentences) reporting the cross-entropy and
perplexity for two sentences, the single highest-loss token in each and why it
was surprising, and one sentence on why you could NOT compare these perplexities
against a model using a different tokenizer.`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "Karpathy — Let's build GPT: from scratch, in code, spelled out",
        url: "https://www.youtube.com/watch?v=kCc8FmEb1nY",
        author: "Andrej Karpathy",
        note: "Builds an autoregressive language model end to end, showing next-token prediction, the softmax over the vocabulary, and cross-entropy loss in code. Companion: the makemore series (github.com/karpathy/nn-zero-to-hero).",
      },
    },
    {
      kind: "citation",
      body: {
        label: "Jurafsky & Martin — Speech and Language Processing (3rd ed.), N-gram Language Models",
        url: "https://web.stanford.edu/~jurafsky/slp3/",
        author: "Dan Jurafsky & James H. Martin",
        note: "The canonical textbook treatment of language modeling as next-token probability and the formal definition of perplexity as the exponentiated cross-entropy / effective branching factor.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Language modeling — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "What does a language model actually output at a single position, before you pick a token?",
        choices: [
          "A single best next token, chosen deterministically.",
          "One logit per vocabulary entry, which softmax turns into a probability distribution over the whole vocabulary.",
          "A cosine similarity between the context and every vocabulary entry.",
          "The cross-entropy loss for that position.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "A model assigns the true next token a probability of 0.5 at every position over a long passage. What is the passage's per-token cross-entropy and perplexity?",
        choices: [
          "CE ≈ 0.69 nats and perplexity ≈ 2.",
          "CE ≈ 0.5 nats and perplexity ≈ 1.5.",
          "CE ≈ 2 nats and perplexity ≈ 0.69.",
          "CE = 0 and perplexity = 0, because the model is right half the time.",
        ],
        answerKey: { correctIndex: 0 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "Why is next-token prediction described as self-supervised, and why does that matter for scale?",
        choices: [
          "Because the model supervises itself with no loss function, so training is unsupervised and cheap.",
          "Because humans label a small seed set and the model extrapolates, cutting labelling cost roughly in half.",
          "Because the label at each position is just the token that already comes next in the raw text, so any unlabelled text is training data — removing the human-labelling bottleneck and letting training scale to trillions of tokens.",
          "Because the tokenizer, not the model, provides the labels, so no text is needed at training time.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "Explain, end to end, why minimizing cross-entropy loss and minimizing perplexity are 'the same number in different clothes', and why a lower perplexity does NOT by itself prove one model is better than another. Reference the effective-branching-factor interpretation and at least one comparability caveat.",
        answerKey: {
          criteria: [
            {
              id: "loss-identity",
              description:
                "Correctly states that cross-entropy is the average of −log p(true token) (average negative log-likelihood), and that perplexity = exp(CE) (or 2^CE in bits), so perplexity is a monotonic transform of the loss — minimizing one minimizes the other; lower is better, 1 is perfect.",
              points: 3,
            },
            {
              id: "branching-factor",
              description:
                "Interprets perplexity as the effective branching factor — the average number of equally-likely tokens the model is choosing among — and connects it back to uncertainty/surprise (e.g. perplexity 2 = as confused as a fair coin over 2 tokens).",
              points: 3,
            },
            {
              id: "comparability",
              description:
                "Gives at least one reason lower perplexity doesn't prove a model is better: it is per-token and only comparable under the same tokenizer, and/or it must be measured on held-out (not training) data, and/or it rewards modelling the training distribution rather than being helpful/honest.",
              points: 2,
            },
          ],
          guidance:
            "Full marks require BOTH the loss↔perplexity monotonic-transform identity AND the effective-branching-factor reading, PLUS at least one valid comparability caveat (same-tokenizer, held-out data, or low-perplexity-is-necessary-not-sufficient). The nats-vs-bits detail is a nice touch but not required for full credit.",
        },
        points: 8,
      },
    ],
  },
};
