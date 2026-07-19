/**
 * Request-time auth gate (Next.js 16 "Proxy" — the renamed `middleware`).
 *
 * DENY BY DEFAULT: every route the matcher covers requires a valid, decrypted
 * session. Anything else is redirected to `/login`. `/login` itself, Next
 * internals, and static assets are excluded via the matcher below.
 *
 * Fail-closed: `unsealSessionCookie` returns null on a missing SESSION_SECRET,
 * a tampered/expired cookie, or any decryption error — all of which redirect to
 * login. Proxy runs on the Node.js runtime in Next 16, so `node:crypto` (used
 * by iron-session) is available here.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, unsealSessionCookie, isAuthed } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const sealed = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await unsealSessionCookie(sealed);

  if (isAuthed(session)) {
    return NextResponse.next();
  }

  // Not authenticated -> send to login, preserving where they were headed.
  const loginUrl = new URL("/login", request.url);
  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from && from !== "/") {
    loginUrl.searchParams.set("from", from);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Run on everything EXCEPT:
   *  - `/login` (the only unauthenticated page)
   *  - `/api/health` (unauthenticated liveness probe, if added later)
   *  - Next internals: `_next/static`, `_next/image`
   *  - `favicon.ico` and common static asset extensions from `public/`
   */
  matcher: [
    "/((?!login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
