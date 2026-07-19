#!/usr/bin/env node
/**
 * Generate a DASHBOARD_PASSWORD_HASH for atlas.
 *
 * Output format:  scrypt$<N>$<r>$<p>$<saltHex>$<keyHex>
 * This is exactly what lib/auth.ts:verifyPassword() parses. The parameters are
 * embedded in the string, so this script and the verifier never drift.
 *
 * Usage (interactive, does NOT leak into shell history — preferred):
 *   node scripts/hash-password.mjs
 *   # then type the password at the prompt
 *
 * Usage (piped):
 *   printf '%s' 'your-password' | node scripts/hash-password.mjs
 *
 * Copy the printed line into .env.local as:
 *   DASHBOARD_PASSWORD_HASH="scrypt$..."
 */
import { scryptSync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

function hash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const password = process.stdin.isTTY
  ? (await prompt("Password: ")).replace(/\r?\n$/, "")
  : (await readStdin()).replace(/\r?\n$/, "");

if (!password) {
  console.error("Error: empty password.");
  process.exit(1);
}

console.log(hash(password));
