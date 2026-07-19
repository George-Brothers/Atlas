"use client";

import { useState } from "react";
import { submitIntake } from "./actions";

const PLACEMENT = [
  { key: "attention", label: "Attention" },
  { key: "embeddings", label: "Embeddings" },
  { key: "fine-tuning", label: "Fine-tuning" },
  { key: "rag", label: "RAG (retrieval-augmented generation)" },
  { key: "eval", label: "Model evaluation" },
] as const;

const CONFIDENCE = [
  { key: "math", label: "Math (linear algebra, calculus)" },
  { key: "programming", label: "Programming (Python)" },
  { key: "ml_basics", label: "ML basics" },
  { key: "llms", label: "LLMs specifically" },
] as const;

function fieldClass() {
  return "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-black outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
}

export function IntakeForm() {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={submitIntake}
      onSubmit={() => setPending(true)}
      className="flex w-full flex-col gap-8"
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Which of these could you already explain to someone?
        </legend>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Anything you check is treated as known and unlocked — you can always
          revisit it.
        </p>
        <div className="flex flex-col gap-2">
          {PLACEMENT.map((p) => (
            <label
              key={p.key}
              className="flex items-center gap-3 text-sm text-zinc-800 dark:text-zinc-200"
            >
              <input
                type="checkbox"
                name={`can_${p.key}`}
                className="h-4 w-4 rounded border-zinc-400"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          How confident are you in each area? (1 = new, 5 = solid)
        </legend>
        <div className="flex flex-col gap-3">
          {CONFIDENCE.map((c) => (
            <label
              key={c.key}
              className="flex items-center justify-between gap-4 text-sm text-zinc-800 dark:text-zinc-200"
            >
              <span>{c.label}</span>
              <select
                name={`confidence_${c.key}`}
                defaultValue="3"
                className={fieldClass()}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Your near-term goal
        <textarea
          name="goal"
          rows={3}
          placeholder="e.g. understand how transformers work well enough to build and evaluate a RAG app"
          className={`${fieldClass()} font-normal`}
        />
      </label>

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex flex-1 flex-col gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Weekly hours
          <input
            type="number"
            name="weeklyHours"
            min={1}
            max={40}
            defaultValue={5}
            className={`${fieldClass()} font-normal`}
          />
        </label>
        <label className="flex flex-1 flex-col gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Session length
          <select
            name="sessionMinutes"
            defaultValue="30"
            className={`${fieldClass()} font-normal`}
          >
            {[15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : "Start learning"}
      </button>
    </form>
  );
}
