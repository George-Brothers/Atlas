import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "../../../_components/app-header";
import {
  getQuizForLesson,
  getAttemptResult,
  type AnswerResult,
} from "@/lib/db/queries";
import { submitQuiz } from "./actions";
import { QuizForm } from "./quiz-form";

// Authenticated, DB-backed — never statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Quiz page. Without `?graded=`, it presents the quiz form. After submission
 * the grading action redirects back here with `?graded=<attemptId>`, and this
 * renders the graded results + the mastery-gate outcome.
 */
export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ graded?: string }>;
}) {
  const { id: lessonId } = await params;
  const { graded } = await searchParams;

  if (graded) {
    return <Results lessonId={lessonId} attemptId={graded} />;
  }

  const quiz = await getQuizForLesson(lessonId);
  if (!quiz) notFound();

  const boundAction = submitQuiz.bind(null, quiz.assessmentId, lessonId);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <Link
          href={`/lesson/${lessonId}`}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; Back to lesson
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {quiz.title ?? "Mastery quiz"}
        </h1>
        <QuizForm questions={quiz.questions} action={boundAction} />
      </main>
    </div>
  );
}

async function Results({
  lessonId,
  attemptId,
}: {
  lessonId: string;
  attemptId: string;
}) {
  const result = await getAttemptResult(attemptId);
  if (!result) notFound();

  const scorePct = result.totalScore != null ? Math.round(result.totalScore) : 0;
  const passed = result.passed === true;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; Dashboard
        </Link>

        <section
          className={`flex flex-col gap-2 rounded-lg border p-5 ${
            passed
              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
              : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
          }`}
        >
          <span className="text-3xl font-semibold tabular-nums text-black dark:text-zinc-50">
            {scorePct}%
          </span>
          {passed ? (
            <>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Mastered. The next topic is now unlocked.
              </p>
              <Link
                href="/"
                className="mt-1 self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                Back to dashboard &rarr;
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Not yet — you need 80% to master this topic. Review the lesson
                and try again; focus on the questions marked below.
              </p>
              <Link
                href={`/lesson/${lessonId}`}
                className="mt-1 self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                Review the lesson &rarr;
              </Link>
            </>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Per-question feedback
          </h2>
          {result.answers.map((a, i) => (
            <AnswerCard key={a.questionId} answer={a} index={i} />
          ))}
        </section>
      </main>
    </div>
  );
}

interface CriterionResult {
  id: string;
  awarded: number;
  maxPoints: number;
  evidence: string;
  justification: string;
}

function AnswerCard({ answer, index }: { answer: AnswerResult; index: number }) {
  const correct = answer.isCorrect === true;
  const response = answer.response as
    | { selectedIndex?: number | null; text?: string; criteria?: CriterionResult[] }
    | null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          <span className="mr-2 text-zinc-400">{index + 1}.</span>
          {answer.prompt}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            correct
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          {answer.score ?? 0}/{answer.points}
        </span>
      </div>

      {answer.type === "mcq" && answer.choices ? (
        <ul className="flex flex-col gap-1 text-sm">
          {answer.choices.map((choice, ci) => {
            const chosen = response?.selectedIndex === ci;
            const isRight = answer.correctIndex === ci;
            return (
              <li
                key={ci}
                className={`rounded px-2 py-1 ${
                  isRight
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : chosen
                      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                      : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {isRight ? "✓ " : chosen ? "✗ " : ""}
                {choice}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          {response?.text ? (
            <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              {response.text}
            </blockquote>
          ) : null}
          {response?.criteria && response.criteria.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {response.criteria.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md bg-zinc-50 p-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.id}</span>
                    <span className="tabular-nums">
                      {c.awarded}/{c.maxPoints}
                    </span>
                  </div>
                  <p className="mt-1">{c.justification}</p>
                  {c.evidence ? (
                    <p className="mt-1 italic text-zinc-500 dark:text-zinc-500">
                      Evidence: &ldquo;{c.evidence}&rdquo;
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {answer.aiFeedback ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Grader: </span>
              {answer.aiFeedback}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
