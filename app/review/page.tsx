import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "../_components/app-header";
import {
  getLearner,
  getDueReviews,
  getReviewResult,
  type ReviewResult,
} from "@/lib/db/queries";
import { FSRS_GRADE_LABELS, type FsrsGrade } from "@/lib/learning/fsrs";
import { submitReview } from "./actions";
import { ReviewCard } from "./review-card";

// Authenticated, DB-backed, per-learner — never statically prerendered.
export const dynamic = "force-dynamic";

/**
 * The spaced-repetition review page. Reviews one due card at a time: it renders
 * the oldest-due card's source question, the review action grades + re-schedules
 * it (FSRS), and redirects back here with `?graded=` to confirm and continue.
 *
 * Auth: the `proxy.ts` gate already requires a valid session for this route;
 * like the other authed pages we additionally send a learner-less visitor to
 * intake so the loop always has a learner to attribute reviews to.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ graded?: string }>;
}) {
  const learner = await getLearner();
  if (!learner) redirect("/intake");

  const { graded } = await searchParams;
  if (graded) {
    const result = await getReviewResult(graded, learner.id);
    if (result) return <GradedCard result={result} />;
    // Unknown/foreign id — fall through to the normal due queue.
  }

  const due = await getDueReviews(learner.id);

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
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Review
        </h1>

        {due.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-5 py-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              You&rsquo;re all caught up.
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              No reviews are due right now. Cards you&rsquo;ve mastered come back
              on their FSRS schedule.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Back to dashboard &rarr;
            </Link>
          </div>
        ) : (
          <DueCard
            card={due[0]}
            remaining={due.length}
          />
        )}
      </main>
    </div>
  );
}

function DueCard({
  card,
  remaining,
}: {
  card: Awaited<ReturnType<typeof getDueReviews>>[number];
  remaining: number;
}) {
  const boundAction = submitReview.bind(null, card.reviewItemId);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {card.topicTitle ?? "Review"}
        </span>
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {remaining} due
        </span>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <ReviewCard question={card.question} action={boundAction} />
      </div>
    </section>
  );
}

function GradedCard({ result }: { result: ReviewResult }) {
  const grade = (result.lastGrade ?? 3) as FsrsGrade;
  const passed = grade >= 2;
  const label = FSRS_GRADE_LABELS[grade] ?? "Reviewed";
  const nextDue = result.dueAt
    ? result.dueAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

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
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {result.topicTitle ?? "Review"}
          </span>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {result.question.prompt}
          </p>
          <p
            className={`text-sm font-medium ${
              passed
                ? "text-emerald-800 dark:text-emerald-300"
                : "text-amber-800 dark:text-amber-300"
            }`}
          >
            Graded <span className="font-semibold">{label}</span>.{" "}
            {nextDue
              ? `Next review scheduled for ${nextDue}${
                  result.scheduledInterval != null
                    ? ` (in ${result.scheduledInterval} day${
                        result.scheduledInterval === 1 ? "" : "s"
                      })`
                    : ""
                }.`
              : "Card re-scheduled."}
          </p>
          {result.question.correctIndex != null &&
          result.question.choices ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Correct answer:{" "}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {result.question.choices[result.question.correctIndex]}
              </span>
            </p>
          ) : null}
        </section>

        <div className="flex items-center gap-3">
          <Link
            href="/review"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Continue reviewing &rarr;
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
