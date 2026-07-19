/**
 * The fixed, hand-authored Tier-1 topic spine (the curriculum DAG).
 *
 * This is authored, not LLM-generated — Phase 1 ships a fixed spine. Topics are
 * ordered so that each one's prerequisites appear before it; the seed script
 * relies on this ordering, and the dashboard renders it top-to-bottom.
 *
 * Only `tokens-embeddings` is authored in full (see `lessons/`); the rest are
 * real DAG nodes with stub lessons (title + objectives) so the graph, gating,
 * and dashboard are genuine while later phases fill in the content.
 */
import type { AuthoredTopic } from "./types";

export const SPINE: AuthoredTopic[] = [
  {
    slug: "tokens-embeddings",
    title: "Tokens & embeddings",
    description:
      "How raw text becomes the numbers a model actually consumes: subword tokenization and learned embedding vectors.",
    targetDepth: 2,
    prereqSlugs: [],
  },
  {
    slug: "neural-nets-backprop",
    title: "Neural nets & backprop",
    description:
      "The learning machinery underneath everything: layers, nonlinearities, loss, and gradient descent via backpropagation.",
    targetDepth: 2,
    prereqSlugs: ["tokens-embeddings"],
  },
  {
    slug: "language-modeling",
    title: "Language modeling",
    description:
      "Framing text as next-token prediction: the objective, perplexity, and why self-supervision scales.",
    targetDepth: 2,
    prereqSlugs: ["neural-nets-backprop"],
  },
  {
    slug: "training-dynamics",
    title: "Training dynamics",
    description:
      "What actually happens during training: batching, learning-rate schedules, loss curves, and scaling behaviour.",
    targetDepth: 2,
    prereqSlugs: ["language-modeling"],
  },
  {
    slug: "attention",
    title: "Attention",
    description:
      "The mechanism that lets a token look at other tokens: queries, keys, values, and softmax-weighted mixing.",
    targetDepth: 2,
    prereqSlugs: ["language-modeling"],
  },
  {
    slug: "transformers-gpt",
    title: "Transformers & GPT",
    description:
      "How attention, MLPs, residual streams, and layer norm stack into the decoder-only Transformer behind GPT models.",
    targetDepth: 2,
    prereqSlugs: ["attention", "training-dynamics"],
  },
  {
    slug: "training-vs-inference",
    title: "Training vs inference",
    description:
      "Two very different regimes: teacher-forced parallel training vs autoregressive, cached, sampled generation.",
    targetDepth: 2,
    prereqSlugs: ["transformers-gpt"],
  },
  {
    slug: "lifecycle-pretrain-sft-preference",
    title: "Lifecycle: pretrain → SFT → preference",
    description:
      "The stages that turn a raw next-token predictor into an assistant: pretraining, supervised fine-tuning, and preference optimization.",
    targetDepth: 2,
    prereqSlugs: ["training-vs-inference"],
  },
  {
    slug: "evaluation",
    title: "Evaluation",
    description:
      "How model quality is measured: benchmarks, held-out perplexity, LLM-as-judge, and why evaluation is hard.",
    targetDepth: 2,
    prereqSlugs: ["transformers-gpt"],
  },
  {
    slug: "rag",
    title: "Retrieval-augmented generation",
    description:
      "Grounding generation in retrieved context: embed, index, retrieve, and condition — and where it breaks.",
    targetDepth: 2,
    prereqSlugs: ["transformers-gpt", "evaluation"],
  },
];
