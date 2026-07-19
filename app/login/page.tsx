import { LoginForm } from "./login-form";

/**
 * The only unauthenticated page. `proxy.ts` excludes `/login` from the gate.
 * If SESSION_SECRET / DASHBOARD_PASSWORD_HASH are unset, the login action
 * refuses every password (fail-closed) and the app stays locked.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <main className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            atlas
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enter the password to continue.
          </p>
        </div>
        <LoginForm from={from} />
      </main>
    </div>
  );
}
