"use client";

import { useState } from "react";
import type { RecallCheckBody } from "@/lib/content/types";
import { Markdown } from "./markdown";

/**
 * An inline recall check embedded in the lesson body (distinct from the graded
 * quiz). Self-checked: the learner answers, then reveals the rubric/answer.
 * Nothing here is persisted — it's a low-stakes retrieval prompt.
 */
export function RecallCheck({ body }: { body: RecallCheckBody }) {
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
      <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Recall check
      </span>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {body.prompt}
      </p>

      {body.format === "free_text" ? (
        <textarea
          rows={3}
          placeholder="Type your answer, then reveal the rubric to self-check."
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {(body.choices ?? []).map((choice, i) => {
            const isAnswer = body.answerIndex === i;
            const show = revealed && isAnswer;
            return (
              <label
                key={i}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  show
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-zinc-300 text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                }`}
              >
                <input
                  type="radio"
                  name={`recall-${body.prompt.slice(0, 16)}`}
                  checked={selected === i}
                  onChange={() => setSelected(i)}
                />
                {choice}
                {show ? <span className="ml-auto text-xs">✓ correct</span> : null}
              </label>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="self-start rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/60"
      >
        {revealed
          ? "Hide"
          : body.format === "free_text"
            ? "Reveal rubric"
            : "Check answer"}
      </button>

      {revealed ? (
        <div className="flex flex-col gap-2 border-t border-amber-300 pt-3 text-sm text-zinc-700 dark:border-amber-900/60 dark:text-zinc-300">
          {body.rubric ? (
            <div>
              <span className="font-semibold">What a good answer covers: </span>
              <Markdown>{body.rubric}</Markdown>
            </div>
          ) : null}
          {body.explanation ? (
            <p>
              <span className="font-semibold">Note: </span>
              {body.explanation}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
