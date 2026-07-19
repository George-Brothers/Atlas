import Link from "next/link";
import { logout } from "../logout/actions";

/** Top bar shared by the authenticated pages: home link + logout. */
export function AppHeader() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Link
        href="/"
        className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50"
      >
        atlas
      </Link>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Log out
        </button>
      </form>
    </header>
  );
}
