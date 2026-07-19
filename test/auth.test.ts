/**
 * Auth-gate unit tests (run with `npm test` / `node --test`).
 *
 * These exercise the fail-closed logic that guards every route without needing
 * a browser: password verification, the LOCKED-when-unconfigured behaviour, and
 * session cookie seal/unseal. Uses `.ts` import specifiers because Node runs
 * these directly via native type-stripping; `test/` is excluded from tsconfig.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sealData } from "iron-session";
import {
  hashPassword,
  verifyPassword,
  unsealSessionCookie,
  getSessionOptions,
  getSessionSecret,
  isAuthed,
  SESSION_TTL_SECONDS,
} from "../lib/auth.ts";

const SECRET = "test-session-secret-that-is-definitely-32+chars-long";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("verifyPassword accepts the correct password and rejects wrong ones", () => {
  const hash = hashPassword("correct horse battery staple");
  withEnv({ DASHBOARD_PASSWORD_HASH: hash }, () => {
    assert.equal(verifyPassword("correct horse battery staple"), true);
    assert.equal(verifyPassword("wrong password"), false);
    assert.equal(verifyPassword(""), false);
  });
});

test("verifyPassword is LOCKED when DASHBOARD_PASSWORD_HASH is unset", () => {
  withEnv({ DASHBOARD_PASSWORD_HASH: undefined }, () => {
    assert.equal(verifyPassword("anything"), false);
  });
});

test("verifyPassword rejects a malformed hash string", () => {
  withEnv({ DASHBOARD_PASSWORD_HASH: "not-a-valid-hash" }, () => {
    assert.equal(verifyPassword("anything"), false);
  });
  withEnv({ DASHBOARD_PASSWORD_HASH: "scrypt$16384$8$1$zz$zz" }, () => {
    // hex parses but wrong -> false, not a throw
    assert.equal(verifyPassword("anything"), false);
  });
});

test("hashPassword produces the self-describing scrypt format", () => {
  const hash = hashPassword("pw");
  assert.match(hash, /^scrypt\$16384\$8\$1\$[0-9a-f]+\$[0-9a-f]+$/);
});

test("getSessionSecret / getSessionOptions require a >=32 char secret", () => {
  withEnv({ SESSION_SECRET: undefined }, () => {
    assert.throws(() => getSessionSecret());
  });
  withEnv({ SESSION_SECRET: "too-short" }, () => {
    assert.throws(() => getSessionSecret());
  });
  withEnv({ SESSION_SECRET: SECRET }, () => {
    const opts = getSessionOptions();
    assert.equal(opts.cookieOptions?.httpOnly, true);
    assert.equal(opts.cookieOptions?.secure, true);
    assert.equal(opts.cookieOptions?.sameSite, "strict");
  });
});

test("unsealSessionCookie returns null for missing/garbage cookies", async () => {
  await withEnvAsync({ SESSION_SECRET: SECRET }, async () => {
    assert.equal(await unsealSessionCookie(undefined), null);
    assert.equal(await unsealSessionCookie(""), null);
    assert.equal(await unsealSessionCookie("garbage.not.a.seal"), null);
  });
});

test("a valid session seal round-trips to an authed payload", async () => {
  await withEnvAsync({ SESSION_SECRET: SECRET }, async () => {
    const sealed = await sealData(
      { authed: true, at: 1_700_000_000_000 },
      { password: SECRET, ttl: SESSION_TTL_SECONDS },
    );
    const session = await unsealSessionCookie(sealed);
    assert.equal(isAuthed(session), true);
    assert.equal(session?.at, 1_700_000_000_000);
  });
});

test("a seal made with a different secret does not authenticate", async () => {
  const sealed = await sealData(
    { authed: true, at: 1 },
    { password: "another-secret-that-is-also-32+chars-long!!", ttl: SESSION_TTL_SECONDS },
  );
  await withEnvAsync({ SESSION_SECRET: SECRET }, async () => {
    assert.equal(await unsealSessionCookie(sealed), null);
  });
});

// async variant of withEnv for the seal/unseal tests.
async function withEnvAsync(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
  }
  try {
    await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}
