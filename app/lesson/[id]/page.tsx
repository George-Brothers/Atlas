import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "../../_components/app-header";
import { getLessonView, type LessonBlock } from "@/lib/db/queries";
import type {
  AppliedTaskBody,
  CitationBody,
  MermaidBody,
  ProseBody,
  RecallCheckBody,
  WorkedExampleBody,
} from "@/lib/content/types";
import { Markdown } from "./markdown";
import { Mermaid } from "./mermaid";
import { RecallCheck } from "./recall-check";
import { AskTutor } from "./ask-tutor";

// Authenticated, DB-backed — never statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Lesson viewer. Renders the ordered `content_block`s: markdown prose, the
 * client-rendered Mermaid diagram, worked examples, inline recall checks,
 * applied tasks, and citations — long-form, textbook style. Published lessons
 * link out to the graded quiz; stubs show their objectives only.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lesson = await getLessonView(id);
  if (!lesson) notFound();

  const isStub = lesson.status !== "published" || lesson.blocks.length === 0;

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

        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50">
            {lesson.title}
          </h1>
          {lesson.objectives.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                By the end you can
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {lesson.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </header>

        {isStub ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            This lesson is a stub — its full content is authored in a later
            phase. The topic, objectives, and its place in the prerequisite
            graph are real.
          </p>
        ) : (
          <article className="flex flex-col gap-6">
            {lesson.blocks.map((block) => (
              <BlockView key={block.id} block={block} />
            ))}
          </article>
        )}

        {!isStub && lesson.assessmentId ? (
          <Link
            href={`/lesson/${lesson.id}/quiz`}
            className="mt-2 self-start rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
          >
            Take the mastery quiz &rarr;
          </Link>
        ) : null}

        {!isStub ? (
          <AskTutor
            topicSlug={lesson.topicSlug}
            topicTitle={lesson.topicTitle}
          />
        ) : null}
      </main>
    </div>
  );
}

function BlockView({ block }: { block: LessonBlock }) {
  switch (block.kind) {
    case "prose": {
      const body = block.body as ProseBody;
      return (
        <section className="flex flex-col gap-2">
          {body.heading ? (
            <h2 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
              {body.heading}
            </h2>
          ) : null}
          <Markdown>{body.markdown}</Markdown>
        </section>
      );
    }
    case "mermaid": {
      const body = block.body as MermaidBody;
      return (
        <figure className="flex flex-col gap-2">
          {body.title ? (
            <figcaption className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {body.title}
            </figcaption>
          ) : null}
          <Mermaid chart={body.diagram} />
          {body.caption ? (
            <figcaption className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {body.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }
    case "worked_example": {
      const body = block.body as WorkedExampleBody;
      return (
        <section className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {body.title}
          </h3>
          <Markdown>{body.markdown}</Markdown>
        </section>
      );
    }
    case "recall_check":
      return <RecallCheck body={block.body as RecallCheckBody} />;
    case "applied_task": {
      const body = block.body as AppliedTaskBody;
      return (
        <section className="flex flex-col gap-2 rounded-lg border border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
          <h3 className="text-base font-semibold text-indigo-900 dark:text-indigo-100">
            {body.title}
          </h3>
          <Markdown>{body.markdown}</Markdown>
        </section>
      );
    }
    case "citation": {
      const body = block.body as CitationBody;
      return (
        <aside className="rounded-md border-l-2 border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
          <a
            href={body.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 underline underline-offset-2 dark:text-blue-400"
          >
            {body.label}
          </a>
          {body.author ? (
            <span className="text-zinc-500 dark:text-zinc-400"> — {body.author}</span>
          ) : null}
          {body.note ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {body.note}
            </p>
          ) : null}
        </aside>
      );
    }
    default:
      return null;
  }
}
