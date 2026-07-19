/**
 * Authentication primitives for atlas's single-password gate.
 *
 * FAIL-CLOSED by design: if `SESSION_SECRET` or `DASHBOARD_PASSWORD_HASH` is
 * missing/invalid, every code path here refuses to authenticate. Nothing in
 * this module imports `next/headers`, so it is safe to import from `proxy.ts`
 * (the request-time gate) as well as from server actions and route handlers.
 */
import {
  scryptSync,
  timingSafeEqual,
  randomBytes,
  type BinaryLike,
} from "node:crypto";
import { unsealData, type SessionOptions } from "iron-session";

/** Name of the encrypted session cookie. */
export const SESSION_COOKIE_NAME = "atlas_session";

/** Session lifetime in seconds (7 days). Used for both the seal TTL and cookie. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Minimum acceptable length for SESSION_SECRET (iron-session requires >= 32). */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** Shape of the decrypted session payload. */
export interface SessionData {
  authed?: boolean;
  /** Unix epoch millis when the session was established. */
  at?: number;
}

/** scrypt parameters. Encoded into the hash string so they are self-describing. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

/**
 * Read and validate SESSION_SECRET. Throws when unset or too short so the app
 * stays LOCKED rather than falling back to a weak/empty key.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET is unset or shorter than ${MIN_SESSION_SECRET_LENGTH} chars. The app is locked until it is set.`,
    );
  }
  return secret;
}

/** iron-session options. Cookie is HttpOnly, Secure, SameSite=Strict. */
export function getSessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE_NAME,
    password: getSessionSecret(),
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      // iron-session sets max-age to ttl - 60s automatically; kept explicit.
      maxAge: SESSION_TTL_SECONDS - 60,
    },
  };
}

/** True when a decrypted session represents an authenticated user. */
export function isAuthed(session: SessionData | null | undefined): boolean {
  return session?.authed === true;
}

/**
 * Decrypt a raw session cookie value (the sealed string iron-session stored).
 * Returns the payload, or `null` on ANY failure — missing value, bad secret,
 * tampered/expired seal. Used by the request-time gate (`proxy.ts`), which has
 * the raw cookie rather than a `next/headers` cookie store.
 */
export async function unsealSessionCookie(
  value: string | undefined,
): Promise<SessionData | null> {
  if (!value) return null;
  try {
    const data = await unsealData<SessionData>(value, {
      password: getSessionSecret(),
      ttl: SESSION_TTL_SECONDS,
    });
    // iron-session returns `{}` (not a throw) for a tampered/wrong-secret seal.
    // Normalize anything that isn't an authenticated session to null so callers
    // get a single, unambiguous "not authed" signal.
    if (!data || data.authed !== true) return null;
    return data;
  } catch {
    // Bad secret, tampered cookie, or expired seal -> treat as unauthenticated.
    return null;
  }
}

/**
 * Verify a plaintext password against DASHBOARD_PASSWORD_HASH using a
 * constant-time comparison. Returns false (locked) if the hash env is unset or
 * malformed — never throws for a bad password.
 *
 * Hash format: `scrypt$<N>$<r>$<p>$<saltHex>$<keyHex>` (see scripts/hash-password.mjs).
 */
export function verifyPassword(input: string): boolean {
  const stored = process.env.DASHBOARD_PASSWORD_HASH;
  if (!stored) return false; // fail-closed: no configured password => locked.

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const keyHex = parts[5];
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
    const salt = Buffer.from(saltHex, "hex");
    if (expected.length === 0 || salt.length === 0) return false;
    actual = scryptSync(input as BinaryLike, salt, expected.length, {
      N,
      r,
      p,
      // scrypt needs ~128*N*r bytes; give headroom above the 32MB default.
      maxmem: 256 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  // Lengths are equal by construction (keylen == expected.length), so
  // timingSafeEqual is safe and the comparison is constant-time.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Hash a plaintext password into the `scrypt$...` storage format.
 * Used by scripts/hash-password.mjs; exported so it can be unit-tested.
 */
export function hashPassword(input: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(input as BinaryLike, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString(
    "hex",
  )}$${key.toString("hex")}`;
}
