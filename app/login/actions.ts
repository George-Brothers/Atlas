"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export interface LoginState {
  error?: string;
}

/**
 * Repeated-failure throttling.
 *
 * In-memory and therefore PER-INSTANCE (per serverless lambda / server
 * process) — it is a speed bump against brute force on a single box, not a
 * distributed rate limiter. Documented as such; a shared store (e.g. Postgres
 * or KV) would be needed for cross-instance guarantees.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute
const attempts = new Map<string, { count: number; firstAt: number }>();

function throttleKey(ip: string): string {
  return ip || "unknown";
}

function isThrottled(key: string): boolean {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
  } else {
    rec.count += 1;
  }
}

/** Only allow same-origin absolute paths to prevent open-redirects. */
function safeReturnPath(from: FormDataEntryValue | null): string {
  if (typeof from !== "string") return "/";
  if (!from.startsWith("/") || from.startsWith("//")) return "/";
  return from;
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const key = throttleKey(ip);

  if (isThrottled(key)) {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const password = formData.get("password");
  const ok = typeof password === "string" && verifyPassword(password);

  if (!ok) {
    recordFailure(key);
    return { error: "Incorrect password." };
  }

  // Success: clear throttle and establish the session.
  attempts.delete(key);
  const session = await getSession();
  session.authed = true;
  session.at = Date.now();
  await session.save();

  redirect(safeReturnPath(formData.get("from")));
}
