/**
 * SHOWCASE LESSON — authored in full.
 *
 * "Tokens & embeddings — what actually happens the instant you hit send."
 * Depth target 2 (mechanistic intuition). Structured with the four-question
 * framing: what is it / why it works / why it's impressive / how you'd use or
 * evaluate it. This is the reference for how every future lesson is authored.
 *
 * The content lives here as typed `AuthoredBlock[]` + an `AuthoredAssessment`
 * so it is schema-checked at build time and inserted verbatim by the seed.
 */
import type { AuthoredLesson } from "../types";

export const tokensEmbeddingsLesson: AuthoredLesson = {
  topicSlug: "tokens-embeddings",
  title: "Tokens & embeddings — what actually happens the instant you hit send",
  estMinutes: 35,
  status: "published",
  objectives: [
    "Explain the text → tokens → ids → vectors pipeline and why each step exists.",
    "Describe subword (BPE) tokenization and predict how a string will split.",
    "Explain what an embedding vector is and why cosine similarity is meaningful.",
    "Reason about token-based costs, context limits, and tokenizer failure modes.",
  ],
  blocks: [
    {
      kind: "prose",
      body: {
        heading: "The instant you hit send",
        markdown: `You type *"Explain embeddings like I'm five"* and press enter. Before the
model predicts a single word, your sentence has already been through two
transformations that decide almost everything about what happens next. It is
cut into **tokens**, and each token is looked up as a **vector of numbers** —
its **embedding**. A large language model never sees your letters. It sees a
grid of floating-point numbers, and everything it "knows" about your prompt has
to survive being squeezed through that grid.

This lesson opens that black box. We will follow four questions the whole way
through — a framing you'll reuse for every topic in atlas:

1. **What is it?** — tokens and embeddings, concretely.
2. **Why does it work?** — why turning words into geometry is a good idea.
3. **Why is it impressive?** — what this buys you that older approaches could not.
4. **How would you use or evaluate it?** — the practical consequences: cost,
   context limits, and the ways tokenization quietly breaks.

By the end you should be able to look at any string and roughly predict how it
tokenizes, and explain — to a skeptical colleague — why \` dog\` and \`dog\` are
*different* tokens and why that occasionally matters.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "What is it — from characters to token ids",
        markdown: `A **token** is the atomic unit a model reads. It is usually *not* a whole word
and *not* a single character — it is a **subword**: a chunk of bytes that the
tokenizer has decided is worth having a dedicated slot for. Common words like
\` the\` or \` model\` are single tokens. Rare or novel words get split into
several pieces.

The tokenizer owns a fixed **vocabulary** — a lookup table of, say, ~100,000
entries, each mapping a byte sequence to an integer **id**. Modern GPT-style
tokenizers build this vocabulary with **Byte-Pair Encoding (BPE)**:

- Start from raw bytes (256 possible values), so *any* input can always be
  represented — there is no "unknown character".
- Scan a huge text corpus and repeatedly find the **most frequent adjacent
  pair** of units, then merge it into a new single unit. \`t\` + \`h\` → \`th\`;
  later \`th\` + \`e\` → \`the\`; and so on for tens of thousands of merges.
- The learned list of merges *is* the tokenizer. Applying it to new text greedily
  replays those merges to cut the string into the fewest, most frequent chunks.

Two consequences fall straight out of this and trip people up constantly:

- **Whitespace is part of the token.** BPE runs over raw bytes, so the leading
  space matters: \` dog\` (space-d-o-g, how "dog" appears mid-sentence) and
  \`dog\` (start of a line) are *different* tokens with *different* ids and
  *different* embeddings. The model learns both, but they are not the same input.
- **Rarer words fragment.** A common word is one token; an unusual one becomes
  several. "tokenization" might be \`token\` + \`ization\`; a name or a typo can
  shatter into many pieces. More fragments means more tokens means more cost and
  more of your context window consumed.`,
      },
    },
    {
      kind: "mermaid",
      body: {
        title: "The text → tokens → ids → vectors pipeline",
        diagram: `flowchart LR
  A["raw text<br/>&quot; dog&quot;"] --> B["tokenizer<br/>(BPE merges)"]
  B --> C["token id<br/>2043"]
  C --> D["embedding matrix<br/>row lookup<br/>(vocab x d_model)"]
  D --> E["embedding vector<br/>[0.11, -0.4, ..., 0.02]<br/>(length d_model)"]
  E --> F["Transformer<br/>layers"]`,
        caption:
          "Your text is cut into tokens, each token becomes an integer id, and each id indexes one row of the embedding matrix. That row — a vector of length d_model — is what the model actually consumes. The embedding matrix is learned during training, not hand-designed.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it works — ids are arbitrary, vectors are meaningful",
        markdown: `A token id is just a row number. Id 2043 is not "bigger" or "closer to" id 2044
in any meaningful sense — the integers are arbitrary labels. If the model had to
work with ids directly it would learn almost nothing transferable.

The trick is the **embedding matrix**: a big learned table of shape
\`[vocab_size, d_model]\` (e.g. \`100000 x 2048\`). Each token id indexes **one
row** — a vector of \`d_model\` numbers. That vector *is* the token's meaning as
far as the model is concerned, and crucially **it is learned**. During
pretraining the model is scored on predicting the next token; gradients flow all
the way back into these rows, nudging them so that tokens which behave similarly
in context end up with **similar vectors**.

The payoff is **geometry**. "Similar" now has a precise meaning: vectors that
point in nearly the same direction. We measure that with **cosine similarity** —
the cosine of the angle between two vectors:

\`\`\`
cos(u, v) = (u · v) / (|u| |v|)
\`\`\`

\`+1\` means same direction (very similar), \`0\` means orthogonal (unrelated),
\`-1\` means opposite. Because the model only ever succeeds at next-token
prediction by grouping things that are used alike, \`cat\` and \`dog\` drift close
together (both are pets, both precede "barked/purred/ran"), while \`cat\` and
\`car\` — which merely *look* similar — end up far apart. **Meaning becomes
distance.** Everything downstream (attention, the MLPs, the final prediction) is
just operations on these vectors, so getting text into a good geometric space is
the foundation the whole model stands on.`,
      },
    },
    {
      kind: "worked_example",
      body: {
        title: "Worked example — tokenizing strings and comparing vectors",
        markdown: `Let's make it concrete. Numbers below are illustrative of a GPT-style BPE
tokenizer (like \`cl100k_base\`); exact ids differ per tokenizer, but the
*behaviour* is what matters.

**1. The leading space changes the token.**

| input | tokens | ids (illustrative) |
|-------|--------|--------------------|
| \`"dog"\` (start of line) | \`["dog"]\` | \`[7742]\` |
| \`" dog"\` (mid-sentence) | \`[" dog"]\` | \`[5679]\` |
| \`"hot dog"\` | \`["hot", " dog"]\` | \`[9143, 5679]\` |

Same three letters, different ids — because the space is part of the byte
sequence BPE merged. This is why \`"dog"\` at the start of your prompt and
\` dog\` inside a sentence are genuinely different inputs to the model.

**2. A rare word fragments; a common one doesn't.**

| input | tokens |
|-------|--------|
| \`" the"\` | \`[" the"]\` — one token |
| \`" antidisestablishmentarianism"\` | \`[" antidis", "establish", "ment", "arian", "ism"]\` — five tokens |
| \`" 1234567"\` | \`[" 123", "45", "67"]\` — digits chunk oddly |

Notice you cannot eyeball token count from word count. The long word costs 5×
more tokens than "the", and the number splits in a way that has nothing to do
with its numeric value — a big reason models are shaky at arithmetic.

**3. Cosine similarity puts meaning into numbers.**

Take (toy, 4-dimensional) learned embeddings:

\`\`\`
cat = [ 0.90,  0.10,  0.80, 0.05]
dog = [ 0.85,  0.15,  0.75, 0.10]
car = [ 0.10,  0.95,  0.05, 0.90]
\`\`\`

Computing cosine similarity:

\`\`\`
cos(cat, dog) ≈ 0.997   # nearly the same direction  -> very similar
cos(cat, car) ≈ 0.28    # large angle                -> unrelated
\`\`\`

\`cat ≈ dog ≫ cat ≈ car\`, even though "cat" and "car" share more letters. The
geometry has captured *use*, not spelling. That single fact — meaning as
direction — is what makes embeddings the workhorse of search, RAG, clustering,
and the input to every LLM.`,
      },
    },
    {
      kind: "prose",
      body: {
        heading: "Why it's impressive",
        markdown: `Three things here are genuinely remarkable, and worth being able to articulate:

- **One fixed vocabulary covers everything.** Because BPE bottoms out at raw
  bytes, the tokenizer can represent *any* input — emoji, code, a language it
  barely saw, a URL, a typo — with **zero** "unknown token" failures. Older NLP
  pipelines had a fixed word list and a dreaded \`<UNK>\` token for everything
  else. Subword tokenization quietly killed that whole class of problem.

- **The representation is learned, not designed.** Nobody wrote down that "cat"
  and "dog" are similar. The embedding geometry *emerged* purely from the
  pressure of predicting the next token over trillions of tokens of text. Useful
  structure — synonyms clustering, analogies as directions, syntax and semantics
  disentangling across dimensions — is a side effect of a dumb objective at
  scale.

- **It's a brutal, effective compression.** A sentence of English is a handful
  of integers, each expanded into a dense vector that already encodes a lot of
  what the word does. The model never wastes capacity relearning spelling; it
  starts from a representation where the hard part — "what does this token tend
  to mean and do?" — is already partly solved.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "free_text",
        prompt:
          "In 3–5 sentences, explain to a smart friend why ` dog` (with a leading space) and `dog` are different tokens, and why that is a direct consequence of how BPE builds its vocabulary.",
        rubric: `A strong answer hits: (1) BPE operates over raw bytes/characters, and the
space character is one of those bytes, so it gets merged into the token; (2) the
tokenizer therefore has separate vocabulary entries (ids) for the space-prefixed
and bare forms; (3) different id ⇒ different learned embedding vector ⇒ literally
a different input to the model. Bonus: notes that mid-sentence words almost
always carry a leading space, so the space-prefixed form is the "normal" one.`,
        explanation:
          "The leading space is not cosmetic — it is part of the byte sequence BPE merged, so ` dog` and `dog` occupy different rows of the embedding matrix.",
      },
    },
    {
      kind: "prose",
      body: {
        heading: "How you'd use or evaluate it",
        markdown: `Tokens are not a trivia detail — they are the unit of almost every practical
concern when you actually build with models:

- **Cost and context are measured in tokens, not words.** API pricing is
  per-token, and the **context window** (e.g. 200K tokens) is a hard token
  budget shared by your prompt *and* the response. A rule of thumb for English
  is ~0.75 words per token, but it's only a rule of thumb — code, JSON, numbers,
  and non-English text can be far denser. If you need to be sure, **count with
  the real tokenizer**, don't estimate from characters.

- **Tokenization explains a lot of "model weirdness."** Shaky arithmetic? Digits
  chunk into arbitrary groups like \`123|45|67\`. Struggles with rhyming, reversing
  strings, or counting letters ("how many r's in strawberry")? The model sees
  tokens, not letters, so character-level tasks fight the representation.
  Inconsistent handling of a rare name or a made-up word? It fragmented into
  pieces the model has weaker statistics for.

- **Non-English and code pay a "token tax."** Languages underrepresented in the
  tokenizer's training corpus fragment into more tokens per word, so the same
  meaning costs more and eats more context — an equity and cost issue worth
  measuring for your workload.

- **How you'd evaluate an embedding space.** For the embeddings themselves, the
  standard checks are *intrinsic* (do nearest neighbours by cosine similarity
  make sense? do analogy directions hold?) and *extrinsic* (does swapping in
  these embeddings improve a downstream task like retrieval, measured by
  recall@k or nDCG?). "Meaning as distance" is only useful if the distances line
  up with a task you care about — so you evaluate against that task, not in the
  abstract.`,
      },
    },
    {
      kind: "recall_check",
      body: {
        format: "mcq",
        prompt:
          "You paste a 500-word English blog post into a model with a 4,000-token context window and get a 'context length exceeded'-style failure with only a short prompt added. What is the MOST likely explanation?",
        choices: [
          "500 words is always more than 4,000 tokens, so it can never fit.",
          "The post contained dense content (code, URLs, numbers, or non-English text) that tokenizes to far more than the ~0.75-words-per-token rule of thumb.",
          "Embedding vectors are counted against the context window in addition to tokens.",
          "The leading spaces on each word doubled the token count.",
        ],
        answerIndex: 1,
        explanation:
          "~0.75 words/token is only a heuristic for prose; code, URLs, numbers and non-English text are much denser, so a 500-word post can blow well past 4,000 tokens. The window is a token budget — always count with the real tokenizer when it's close.",
      },
    },
    {
      kind: "applied_task",
      body: {
        title: "Applied task — tokenize, measure, and compare (30 min, hands-on)",
        markdown: `Do this with real tools to make the mechanics stick.

1. **Tokenize and count.** Install \`tiktoken\` (Python) and encode a few
   strings. Confirm for yourself that:
   - \`"dog"\` and \`" dog"\` produce **different** ids.
   - A rare word (your full name, "antidisestablishmentarianism", or a random
     hash) produces **more** tokens than a common word.
   - A paragraph of English, a block of JSON, and the same length of a
     non-English language give **different** token counts. Note the ratio of
     tokens to characters for each.

   \`\`\`python
   import tiktoken
   enc = tiktoken.get_encoding("cl100k_base")
   for s in ["dog", " dog", "hot dog", " 1234567", " antidisestablishmentarianism"]:
       print(repr(s), enc.encode(s))
   \`\`\`

2. **Build a tiny BPE yourself.** Skim Karpathy's \`minbpe\` and run its training
   on a paragraph. Watch the merge list grow and confirm the most frequent pairs
   merge first — this is the whole algorithm.

3. **Feel the geometry.** Get sentence/word embeddings (any embeddings API or a
   small local model), embed \`cat\`, \`dog\`, \`car\`, \`kitten\`, \`truck\`, and
   compute pairwise cosine similarities. Confirm \`cat≈dog≈kitten\` cluster and
   \`car≈truck\` cluster, with the two clusters far apart.

**Deliverable:** a short note (5–8 sentences) reporting your token counts and
one cosine-similarity comparison, and stating one concrete consequence for a
project you might build (e.g. "our non-English support tickets will cost ~1.8×
more tokens than English ones").`,
      },
    },
    {
      kind: "citation",
      body: {
        label: "Karpathy — Let's build the GPT Tokenizer (video) & minbpe",
        url: "https://www.youtube.com/watch?v=zduSFxRajkE",
        author: "Andrej Karpathy",
        note: "Builds a BPE tokenizer from scratch and explains every quirk (spaces, digits, non-English). Companion code: github.com/karpathy/minbpe.",
      },
    },
    {
      kind: "citation",
      body: {
        label: "Stanford CS224N — Word Vectors (word2vec / GloVe)",
        url: "https://web.stanford.edu/class/cs224n/",
        author: "Manning et al., Stanford CS224N",
        note: "The classic treatment of learned word embeddings and 'meaning as geometry', including cosine similarity and analogy structure.",
      },
    },
  ],
  assessment: {
    kind: "quiz",
    title: "Tokens & embeddings — mastery check",
    passingScore: 80,
    questions: [
      {
        type: "mcq",
        prompt:
          "Which statement best describes what a token id is used for inside the model?",
        choices: [
          "The id's integer value is fed directly into the network as a number.",
          "The id indexes one row of a learned embedding matrix; that row's vector is what the model consumes.",
          "The id is the cosine similarity between the token and the previous token.",
          "The id encodes the token's position in the sentence.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "Why does Byte-Pair Encoding never need an 'unknown token' (`<UNK>`)?",
        choices: [
          "Its vocabulary contains every word in every language.",
          "It falls back to a special <UNK> id for anything unseen.",
          "It bottoms out at raw bytes, so any input can always be represented as some sequence of tokens.",
          "It embeds unknown words as the zero vector.",
        ],
        answerKey: { correctIndex: 2 },
        points: 1,
      },
      {
        type: "mcq",
        prompt:
          "`cos(cat, dog) ≈ 0.99` while `cos(cat, car) ≈ 0.28`. What does this tell you?",
        choices: [
          "'cat' and 'car' are more similar because they share more letters.",
          "The embedding geometry captures how tokens are used, so 'cat' and 'dog' are close and 'car' is far — spelling is irrelevant.",
          "Cosine similarity measures string edit distance.",
          "The vectors for 'cat' and 'dog' are identical.",
        ],
        answerKey: { correctIndex: 1 },
        points: 1,
      },
      {
        type: "free_text",
        prompt:
          "Walk through everything that happens to the string ` dog` between hitting send and the first Transformer layer. Name each stage, what it produces, and why embeddings are more useful to the model than the raw token id.",
        answerKey: {
          criteria: [
            {
              id: "pipeline",
              description:
                "Correctly orders the pipeline: text → tokenizer (BPE) → token id(s) → embedding matrix row lookup → embedding vector → Transformer.",
              points: 3,
            },
            {
              id: "id-vs-vector",
              description:
                "Explains that the id is an arbitrary row index (no inherent meaning), whereas the embedding vector is a learned, dense representation where similar tokens have similar vectors.",
              points: 3,
            },
            {
              id: "why-learned",
              description:
                "Notes that the embedding matrix is learned during training (gradients from next-token prediction shape the rows), i.e. the geometry is emergent, not designed.",
              points: 2,
            },
          ],
          guidance:
            "Full marks require the correct pipeline order AND the id-is-arbitrary vs vector-is-meaningful contrast. The leading space on ` dog` is a nice detail but not required for full credit.",
        },
        points: 8,
      },
    ],
  },
};
