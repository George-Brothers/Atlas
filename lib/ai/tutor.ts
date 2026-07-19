/**
 * Grounded tutor — the "Ask about this topic" live path.
 *
 * Wires the two providers atlas uses directly (no gateway): OpenAI for the query
 * EMBEDDING (`lib/ai/embeddings.ts`) and DeepSeek `deepseek-v4-flash` for the
 * ANSWER (the cheap slot via `lib/ai`). The flow is: embed the question →
 * retrieve top-k chunks by cosine over pgvector → generate an answer GROUNDED in
 * those chunks (`groundedAnswer`), citing the lessons they came from.
 *
 * This is a SECOND live call alongside the strict grader, and a deliberately
 * separate persona (`TUTOR_SYSTEM`) that shares no code with the grader — the
 * grader's identity-blind strictness is untouched. When nothing relevant is
 * retrieved, `groundedAnswer` returns the honest fallback WITHOUT any model call,
 * so an empty/thin corpus can never produce a hallucinated lesson.
 */
import "server-only";
import { generateText } from "ai";
import { getModel } from "./index";
import { embedQuery } from "./embeddings";
import { retrieveTopK } from "@/lib/rag/retrieve";
import { groundedAnswer, type TutorResult } from "./tutor-prompt";

/** Default number of chunks to retrieve and ground the answer in. */
export const DEFAULT_TOP_K = 5;

/**
 * Answer one tutor question, grounded in retrieved course material. Optionally
 * scoped to a topic (the "this topic" surface passes the lesson's gate topic).
 * Requires `OPENAI_API_KEY` (embedding) and `DEEPSEEK_API_KEY` (generation) at
 * runtime — both fail closed with a clear error if unset.
 */
export async function askTutor(args: {
  question: string;
  topicId?: string | null;
  k?: number;
}): Promise<TutorResult> {
  const question = args.question.trim();
  const k = args.k ?? DEFAULT_TOP_K;

  const embedding = await embedQuery(question);
  const chunks = await retrieveTopK(embedding, k, {
    topicId: args.topicId ?? undefined,
  });

  return groundedAnswer({
    question,
    chunks,
    generate: async (system, prompt) => {
      const { text } = await generateText({
        model: getModel("cheap"),
        system,
        prompt,
        // Low temperature: the answer should track the evidence, not improvise.
        temperature: 0.2,
      });
      return text;
    },
  });
}
