/**
 * Server-side session access for Server Components, Server Actions and Route
 * Handlers. Uses the `next/headers` cookie store, so it must NOT be imported
 * from `proxy.ts` (which reads the raw request cookie via `lib/auth`).
 */
import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { getSessionOptions, type SessionData } from "./auth";

/** Get the current iron-session, reading/writing the response cookie store. */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}
