"use server";

import { getSession } from "@/lib/session";
import { isAuthed } from "@/lib/auth";
import { getTopicIdBySlug } from "@/lib/db/queries";
import { askTutor } from "@/lib/ai/tutor";
import type { Citation } from "@/lib/ai/tutor-prompt";

/**
 * State for the "Ask about this topic" surface (`useActionState`). Carries the
 * grounded answer, whether it was grounded (vs. the honest "not covered"
 * fallback), and the citations to render under it.
 */
export interface AskState {
  status: "idle" | "answered" | "error";
  question: string;
  answer: string;
  grounded: boolean;
  citations: Citation[];
  error?: string;
}

export const INITIAL_ASK_STATE: AskState = {
  status: "idle",
  question: "",
  answer: "",
  grounded: false,
  citations: [],
};

/**
 * Answer a learner question grounded in the retrieved course material for a
 * topic. Server Actions are publicly callable, so re-check the session here
 * (defense in depth beyond the `proxy.ts` gate). The tutor is NEVER given
 * learner identity — it answers only from retrieved chunks (`askTutor`).
 */
export async function askTopicTutor(
  _prev: AskState,
  formData: FormData,
): Promise<AskState> {
  const session = await getSession();
  if (!isAuthed(session)) {
    return { ...INITIAL_ASK_STATE, status: "error", error: "Not authorized." };
  }

  const question = String(formData.get("question") ?? "").trim();
  const topicSlug = String(formData.get("topicSlug") ?? "").trim();

  if (!question) {
    return {
      ...INITIAL_ASK_STATE,
      status: "error",
      error: "Type a question first.",
    };
  }

  try {
    const topicId = topicSlug ? await getTopicIdBySlug(topicSlug) : null;
    const result = await askTutor({ question, topicId });
    return {
      status: "answered",
      question,
      answer: result.answer,
      grounded: result.grounded,
      citations: result.citations,
    };
  } catch (err) {
    console.error("askTopicTutor failed:", err);
    return {
      ...INITIAL_ASK_STATE,
      question,
      status: "error",
      error:
        "The tutor is unavailable right now. It needs the OpenAI and DeepSeek " +
        "credentials configured on the server.",
    };
  }
}
