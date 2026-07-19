import { IntakeForm } from "./intake-form";

/**
 * Intake questionnaire. This is where a first-run learner lands (the dashboard
 * redirects here until intake is complete). It seeds the learner profile +
 * initial mastery; the auth gate still protects it via `proxy.ts`.
 */
export default function IntakePage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Let&rsquo;s place you
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            A few questions so atlas can skip what you know and start you at the
            right depth. Takes about a minute.
          </p>
        </div>
        <IntakeForm />
      </main>
    </div>
  );
}
