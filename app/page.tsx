import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "./_components/app-header";
import {
  getLearner,
  isIntakeComplete,
  getDashboard,
  type SpineTopicView,
} from "@/lib/db/queries";

// Authenticated, DB-backed, per-learner — never statically prerendered.
export const dynamic = "force-dynamic";

/**
 * The dashboard — the authenticated home. Replaces the Phase 0 placeholder.
 *
 * First run (no learner, or intake not yet completed) redirects to `/intake`.
 * Otherwise it renders the curriculum spine with per-topic status, a mastery
 * overview, and the single next action. Reads entirely from the DB.
 */
export default async function Dashboard() {
  const learner = await getLearner();
  if (!learner || !(await isIntakeComplete(learner.id))) {
    redirect("/intake");
  }

  const dash = await getDashboard(learner.id);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Foundations of Modern LLMs
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {dash.masteredCount} of {dash.totalCount} topics mastered. Master
            each topic to unlock the next.
          </p>
          <MasteryBar
            mastered={dash.masteredCount}
            total={dash.totalCount}
          />
        </section>

        {dash.dueReviewCount > 0 ? (
          <ReviewsDue count={dash.dueReviewCount} />
        ) : null}

        {dash.nextLessonId ? (
          <NextAction
            lessonId={dash.nextLessonId}
            title={
              dash.topics.find((t) => t.slug === dash.nextTopicSlug)?.title ??
              "your next topic"
            }
          />
        ) : (
          <p className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            Nothing available right now — everything reachable is mastered. More
            topics are authored in later phases.
          </p>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Curriculum spine
          </h2>
          <ol className="flex flex-col gap-2">
            {dash.topics.map((t) => (
              <TopicRow key={t.slug} topic={t} />
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

function ReviewsDue({ count }: { count: number }) {
  return (
    <Link
      href="/review"
      className="flex items-center justify-between rounded-lg border border-indigo-300 bg-indigo-50 px-5 py-4 transition-colors hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/70"
    >
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
          Spaced repetition
        </span>
        <span className="text-base font-medium text-indigo-950 dark:text-indigo-50">
          {count} review{count === 1 ? "" : "s"} due
        </span>
      </div>
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
        Review &rarr;
      </span>
    </Link>
  );
}

function MasteryBar({ mastered, total }: { mastered: number; total: number }) {
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className="h-full rounded-full bg-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function NextAction({
  lessonId,
  title,
}: {
  lessonId: string;
  title: string;
}) {
  return (
    <Link
      href={`/lesson/${lessonId}`}
      className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-4 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70"
    >
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Next up
        </span>
        <span className="text-base font-medium text-emerald-950 dark:text-emerald-50">
          {title}
        </span>
      </div>
      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        Start &rarr;
      </span>
    </Link>
  );
}

const STATUS_META: Record<
  SpineTopicView["status"],
  { label: string; dot: string; text: string }
> = {
  mastered: {
    label: "Mastered",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  available: {
    label: "Available",
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
  },
  locked: {
    label: "Locked",
    dot: "bg-zinc-400",
    text: "text-zinc-500 dark:text-zinc-500",
  },
};

function TopicRow({ topic }: { topic: SpineTopicView }) {
  const meta = STATUS_META[topic.status];
  const clickable =
    (topic.status === "available" || topic.status === "mastered") &&
    topic.lessonId;

  const inner = (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${
        clickable
          ? "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          : "border-zinc-200 bg-white/60 dark:border-zinc-800/60 dark:bg-zinc-950/40"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={`text-sm font-medium ${
            topic.status === "locked"
              ? "text-zinc-500 dark:text-zinc-500"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {topic.title}
        </span>
        {topic.description ? (
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-500">
            {topic.description}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {topic.masteryScore != null ? (
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
            {Math.round(topic.masteryScore)}%
          </span>
        ) : null}
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
        <span className={`text-xs font-medium ${meta.text}`}>{meta.label}</span>
      </div>
    </div>
  );

  return (
    <li>
      {clickable ? (
        <Link href={`/lesson/${topic.lessonId}`}>{inner}</Link>
      ) : (
        inner
      )}
    </li>
  );
}
