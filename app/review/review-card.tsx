"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/db/queries";

/**
 * A single due review card. Presents its source question exactly like the quiz
 * (MCQ radios / free-text textarea) and submits the bound review action, which
 * grades the answer and re-schedules the card via FSRS.
 */
export function ReviewCard({
  question,
  action,
}: {
  question: QuizQuestion;
  action: (formData: FormData) => void;
}) {
  const [pending, setPending] = useState(false);
  const isFreeText = question.type !== "mcq";

  return (
    <form
      action={action}
      onSubmit={() => setPending(true)}
      className="flex flex-col gap-5"
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-medium text-zinc-900 dark:text-zinc-100">
          {question.prompt}
        </legend>

        {question.type === "mcq" && question.choices ? (
          <div className="flex flex-col gap-2">
            {question.choices.map((choice, ci) => (
              <label
                key={ci}
                className="flex items-start gap-3 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <input
                  type="radio"
                  name={`q_${question.id}`}
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
            name={`q_${question.id}`}
            rows={6}
            required
            placeholder="Recall the answer from memory, then write it out. The grader scores it against a rubric — be specific and precise."
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        )}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "Grading…" : "Submit answer"}
      </button>
      {pending && isFreeText ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Grading the written answer with the strict grader — this can take a few
          seconds.
        </p>
      ) : null}
    </form>
  );
}
