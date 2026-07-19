"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/db/queries";

/**
 * The quiz form. MCQs render as radio groups (graded deterministically);
 * the free-text question renders as a textarea (graded by the strict LLM
 * grader on submit). The submit action is bound server-side and passed in.
 */
export function QuizForm({
  questions,
  action,
}: {
  questions: QuizQuestion[];
  action: (formData: FormData) => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={action}
      onSubmit={() => setPending(true)}
      className="flex flex-col gap-8"
    >
      {questions.map((q, qi) => (
        <fieldset key={q.id} className="flex flex-col gap-3">
          <legend className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            <span className="mr-2 text-zinc-400">{qi + 1}.</span>
            {q.prompt}
          </legend>

          {q.type === "mcq" && q.choices ? (
            <div className="flex flex-col gap-2">
              {q.choices.map((choice, ci) => (
                <label
                  key={ci}
                  className="flex items-start gap-3 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  <input
                    type="radio"
                    name={`q_${q.id}`}
                    value={ci}
                    required
                    className="mt-0.5"
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              name={`q_${q.id}`}
              rows={6}
              required
              placeholder="Write your explanation. The grader scores it against a rubric — be specific and precise."
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          )}
        </fieldset>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "Grading…" : "Submit for grading"}
      </button>
      {pending ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Grading the written answer with the strict grader — this can take a few
          seconds.
        </p>
      ) : null}
    </form>
  );
}
