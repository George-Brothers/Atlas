"use client";

import { useActionState } from "react";
import { askTopicTutor, INITIAL_ASK_STATE } from "./actions";
import { Markdown } from "./markdown";

/**
 * "Ask about this topic" — the grounded-tutor surface on the lesson page.
 *
 * The learner asks a question; the server action embeds it, retrieves the top-k
 * chunks from atlas's own lessons (scoped to this topic), and generates an
 * answer GROUNDED in them. The tutor answers only from that retrieved material
 * and says so when the course doesn't cover the question — the citations below
 * the answer show which lessons it drew on.
 */
export function AskTutor({
  topicSlug,
  topicTitle,
}: {
  topicSlug: string | null;
  topicTitle: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    askTopicTutor,
    INITIAL_ASK_STATE,
  );

  // De-duplicate citations by source for display, keeping the first ref number.
  const shownCitations = state.citations.filter(
    (c, i, arr) => arr.findIndex((o) => o.sourceTitle === c.sourceTitle) === i,
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-blue-300 bg-blue-50 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-blue-950 dark:text-blue-100">
          Ask about this topic
        </h2>
        <p className="text-sm text-blue-900/80 dark:text-blue-200/70">
          Ask a question about{" "}
          {topicTitle ? (
            <span className="font-medium">{topicTitle}</span>
          ) : (
            "this topic"
          )}
          . The tutor answers only from atlas&rsquo;s own lessons and cites them
          — if the course doesn&rsquo;t cover it, it&rsquo;ll say so rather than
          guess.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-2">
        {topicSlug ? (
          <input type="hidden" name="topicSlug" value={topicSlug} />
        ) : null}
        <textarea
          name="question"
          rows={3}
          required
          defaultValue={state.question}
          placeholder="e.g. Why does cosine similarity work for retrieval?"
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400 dark:border-blue-800 dark:bg-zinc-950 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-blue-600"
        >
          {pending ? "Thinking…" : "Ask the tutor"}
        </button>
      </form>

      {state.status === "error" ? (
        <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
      ) : null}

      {state.status === "answered" ? (
        <div className="flex flex-col gap-3 border-t border-blue-300 pt-3 dark:border-blue-900/60">
          {!state.grounded ? (
            <span className="self-start rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Not covered by the course material
            </span>
          ) : null}
          <div className="text-sm text-zinc-800 dark:text-zinc-200">
            <Markdown>{state.answer}</Markdown>
          </div>
          {shownCitations.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-blue-200 pt-2 dark:border-blue-900/40">
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-800/80 dark:text-blue-300/70">
                Sources
              </span>
              <ul className="flex flex-col gap-0.5">
                {shownCitations.map((c) => (
                  <li
                    key={c.ref}
                    className="text-xs text-blue-900/80 dark:text-blue-200/70"
                  >
                    <span className="font-medium">[{c.ref}]</span>{" "}
                    {c.sourceTitle}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
