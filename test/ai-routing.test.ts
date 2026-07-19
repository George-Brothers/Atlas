/**
 * AI provider unit tests (run with `npm test` / `node --test`).
 *
 * Deterministic, NO network and NO DeepSeek credential required. Covers:
 *  - slot → direct-provider model id resolution + env overrides,
 *  - fail-closed behaviour when no DeepSeek key is configured,
 *  - the strong slot has no live provider yet (clean seam, fails clearly),
 *  - the load-bearing identity-blind grader contract survives the swap,
 *  - the golden-set eval math (the live strictness gate) is itself correct.
 *
 * The LIVE strictness eval (real DeepSeek calls) is `scripts/grader-eval.ts` /
 * `npm run eval:grader` and is intentionally NOT part of this suite.
 *
 * Uses `.ts` import specifiers because Node runs these directly via native
 * type-stripping; `test/` is excluded from tsconfig.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MODELS,
  resolveModelId,
  getDeepSeekApiKey,
  getModel,
  AI_MODELS,
} from "../lib/ai/index.ts";
import {
  GRADER_SYSTEM,
  buildGraderUserPrompt,
  type GradeFreeTextInput,
} from "../lib/ai/grader-prompt.ts";
import { FIXTURES } from "./grader-eval/fixtures.ts";
import {
  maxPoints,
  awardedFraction,
  evaluateFixture,
  summarize,
} from "./grader-eval/harness.ts";

// ── Routing ─────────────────────────────────────────────────────────────────

test("default slots are direct-provider model ids (migrated off the gateway)", () => {
  // The grader (cheap slot) calls DeepSeek's API directly: a bare DeepSeek
  // model id, NOT a `provider/model` gateway slug.
  assert.equal(DEFAULT_MODELS.cheap, "deepseek-v4-flash");
  // No slot may default to a gateway `provider/model` slug or a direct Claude id.
  for (const id of Object.values(DEFAULT_MODELS)) {
    assert.ok(!id.includes("/"), `id ${id} must be a direct model id, not a gateway slug`);
    assert.ok(!/^claude-/.test(id), `id ${id} must not be a direct Claude id`);
  }
  // The cheap slot must not resolve to the pricier/slower DeepSeek chat model.
  assert.notEqual(DEFAULT_MODELS.cheap, "deepseek-v4-pro");
});

test("AI_MODELS snapshot matches the default resolution with no overrides", () => {
  assert.equal(AI_MODELS.cheap, resolveModelId("cheap", {}));
  assert.equal(AI_MODELS.strong, resolveModelId("strong", {}));
});

test("resolveModelId falls back to defaults when unset", () => {
  assert.equal(resolveModelId("cheap", {}), DEFAULT_MODELS.cheap);
  assert.equal(resolveModelId("strong", {}), DEFAULT_MODELS.strong);
});

test("resolveModelId honours AI_CHEAP_MODEL / AI_STRONG_MODEL overrides", () => {
  // Overrides are opaque strings passed straight to the provider.
  assert.equal(
    resolveModelId("cheap", { AI_CHEAP_MODEL: "deepseek-reasoner" }),
    "deepseek-reasoner",
  );
  assert.equal(
    resolveModelId("strong", { AI_STRONG_MODEL: "gemini-3-pro" }),
    "gemini-3-pro",
  );
});

test("resolveModelId ignores blank overrides", () => {
  assert.equal(resolveModelId("cheap", { AI_CHEAP_MODEL: "   " }), DEFAULT_MODELS.cheap);
  assert.equal(resolveModelId("cheap", { AI_CHEAP_MODEL: "" }), DEFAULT_MODELS.cheap);
});

test("getDeepSeekApiKey reads DEEPSEEK_API_KEY (trimmed, empty → undefined)", () => {
  assert.equal(getDeepSeekApiKey({}), undefined);
  assert.equal(getDeepSeekApiKey({ DEEPSEEK_API_KEY: "sk-abc" }), "sk-abc");
  assert.equal(getDeepSeekApiKey({ DEEPSEEK_API_KEY: "  " }), undefined);
  assert.equal(getDeepSeekApiKey({ DEEPSEEK_API_KEY: "" }), undefined);
  // The dead gateway credentials no longer authenticate anything.
  assert.equal(getDeepSeekApiKey({ AI_GATEWAY_API_KEY: "k1" }), undefined);
  assert.equal(getDeepSeekApiKey({ VERCEL_OIDC_TOKEN: "oidc" }), undefined);
});

test("getModel is fail-closed: throws a clear error with no DeepSeek credential", () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    assert.throws(() => getModel("cheap"), /DEEPSEEK_API_KEY/);
  } finally {
    if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved;
  }
});

test("getModel('strong') fails clearly: no live provider is wired yet", () => {
  // The strong slot is a documented seam for a direct Google/Gemini provider
  // (M4/vision). Even WITH a DeepSeek key present it must not silently route
  // strong-slot work to DeepSeek — it throws a clear, seam-documenting error.
  const saved = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "sk-present";
  try {
    assert.throws(() => getModel("strong"), /strong.*slot|M4|no live provider/i);
  } finally {
    if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

// ── Identity-blind grader contract (load-bearing anti-sycophancy) ────────────

test("grader prompt contains only question/rubric/answer — no learner identity", () => {
  const input: GradeFreeTextInput = {
    questionPrompt: "Define a token.",
    criteria: [{ id: "c1", description: "States it is a subword unit.", points: 3 }],
    guidance: "Grader-only reference.",
    learnerResponse: "A token is a subword chunk the model reads.",
  };
  const prompt = buildGraderUserPrompt(input);

  assert.ok(prompt.includes("Define a token."));
  assert.ok(prompt.includes("States it is a subword unit."));
  assert.ok(prompt.includes("A token is a subword chunk the model reads."));

  // The dynamic user prompt must never carry learner identity/history DATA.
  // (The static GRADER_SYSTEM legitimately says there is "no learner to
  // encourage" — that anti-sycophancy language is the guard, not a leak, so it
  // is intentionally not scanned here.)
  const forbidden = [
    "streak",
    "mastery level",
    "learner name",
    "learner id",
    "review history",
    "confidence rating",
    "their level",
  ];
  const haystack = prompt.toLowerCase();
  for (const term of forbidden) {
    assert.ok(!haystack.includes(term), `grader prompt leaks "${term}"`);
  }

  // The system persona must still explicitly assert grading is identity-blind.
  assert.match(GRADER_SYSTEM, /you do not know who wrote this/i);
});

test("GradeFreeTextInput has no identity fields at the source level", () => {
  // Source-level guard: the grader's ONLY input contract stays these 4 fields.
  const src = readFileSync(
    fileURLToPath(new URL("../lib/ai/grader-prompt.ts", import.meta.url)),
    "utf8",
  );
  const iface = src.slice(
    src.indexOf("interface GradeFreeTextInput"),
    src.indexOf("}", src.indexOf("interface GradeFreeTextInput")),
  );
  for (const field of ["questionPrompt", "criteria", "guidance", "learnerResponse"]) {
    assert.ok(iface.includes(field), `expected field ${field} in input contract`);
  }
  for (const banned of [
    "learnerId",
    "learnerName",
    "streak",
    "history",
    "masteryLevel",
    "profile",
  ]) {
    assert.ok(!iface.includes(banned), `input contract must not carry ${banned}`);
  }
});

// ── Golden-set eval math (the live strictness gate is built on this) ─────────

test("fixtures span the full quality spectrum with valid bands", () => {
  const categories = new Set(FIXTURES.map((f) => f.category));
  for (const c of ["correct", "partial", "vague-trap", "wrong", "offtopic", "empty"]) {
    assert.ok(categories.has(c as never), `fixtures missing category ${c}`);
  }
  for (const f of FIXTURES) {
    const [min, max] = f.expectedBand;
    assert.ok(min >= 0 && max <= 1 && min <= max, `bad band on ${f.id}`);
    assert.ok(f.criteria.length > 0, `fixture ${f.id} has no rubric`);
    assert.ok(maxPoints(f.criteria) > 0, `fixture ${f.id} rubric has 0 points`);
  }
  assert.ok(FIXTURES.length >= 10, "expected a reasonably sized golden set");
});

test("awardedFraction clamps and normalises per rubric", () => {
  const criteria = [
    { id: "a", description: "", points: 4 },
    { id: "b", description: "", points: 6 },
  ];
  assert.equal(awardedFraction(criteria, [{ id: "a", awarded: 4 }, { id: "b", awarded: 6 }]), 1);
  assert.equal(awardedFraction(criteria, []), 0);
  // Over-award on a criterion is clamped to its max, missing id counts as 0.
  assert.equal(awardedFraction(criteria, [{ id: "a", awarded: 99 }]), 0.4);
});

test("evaluateFixture flags over-crediting as tooLenient", () => {
  const trap = FIXTURES.find((f) => f.id === "tok-vague-trap")!;
  const full = trap.criteria.map((c) => ({ id: c.id, awarded: c.points }));
  const lenient = evaluateFixture(trap, full);
  assert.equal(lenient.tooLenient, true);
  assert.equal(lenient.withinBand, false);

  const denied = evaluateFixture(trap, []);
  assert.equal(denied.tooLenient, false);
  assert.equal(denied.withinBand, true);
});

test("summarize gate passes only when no must-deny fixture is over-credited", () => {
  // A perfectly strict grader: award full on correct, zero on everything else.
  const strictVerdicts = FIXTURES.map((f) => {
    const graded =
      f.category === "correct"
        ? f.criteria.map((c) => ({ id: c.id, awarded: c.points }))
        : [];
    return evaluateFixture(f, graded);
  });
  assert.equal(summarize(strictVerdicts).passed, true);

  // A lenient grader that over-credits the vague traps must fail the gate.
  const lenientVerdicts = FIXTURES.map((f) =>
    evaluateFixture(
      f,
      f.criteria.map((c) => ({ id: c.id, awarded: c.points })),
    ),
  );
  const summary = summarize(lenientVerdicts);
  assert.equal(summary.passed, false);
  assert.ok(summary.strictnessFailures.length > 0);
});
