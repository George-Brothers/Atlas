/**
 * Golden-set grader eval — the LIVE acceptance gate for the grader model.
 *
 * Runs the REAL `gradeFreeText` (lib/ai/grader.ts) — i.e. the actual cheap-slot
 * DeepSeek model — against the human-labelled golden set (`test/grader-eval/`)
 * and asserts it grades AT LEAST AS STRICTLY as Claude did: it must never
 * over-credit a plausible-but-empty, wrong, off-topic, or blank answer.
 *
 *   Run:   npm run eval:grader
 *   Needs: DEEPSEEK_API_KEY  (direct DeepSeek API key)
 *   Model: the cheap slot — deepseek-v4-flash by default; override with
 *          AI_CHEAP_MODEL=... npm run eval:grader   (e.g. deepseek-v4-pro)
 *
 * Exits non-zero if the strictness gate fails or any answer produced invalid
 * structured output, so it can gate CI. This is deliberately NOT part of
 * `npm test` (which needs no key); the pure eval math is unit-tested there.
 *
 * `server-only` is neutralised via the `--conditions=react-server` flag in the
 * npm script — an eval harness is a legitimate server context.
 */
import { gradeFreeText } from "../lib/ai/grader.ts";
import { resolveModelId, getDeepSeekApiKey } from "../lib/ai/index.ts";
import { FIXTURES } from "../test/grader-eval/fixtures.ts";
import {
  evaluateFixture,
  summarize,
  maxPoints,
  type FixtureVerdict,
  type GradedCriterion,
} from "../test/grader-eval/harness.ts";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

async function main(): Promise<void> {
  if (!getDeepSeekApiKey()) {
    console.error(
      "\n✗ No DeepSeek credential. Set DEEPSEEK_API_KEY (direct DeepSeek API key)\n" +
        "  before running the grader eval.\n",
    );
    process.exit(2);
  }

  const model = resolveModelId("cheap");
  console.log(`\nGrader golden-set eval — model: ${model}`);
  console.log(`Fixtures: ${FIXTURES.length}\n`);

  const verdicts: FixtureVerdict[] = [];
  let schemaFailures = 0;

  for (const fixture of FIXTURES) {
    try {
      const result = await gradeFreeText({
        questionPrompt: fixture.questionPrompt,
        criteria: fixture.criteria,
        guidance: fixture.guidance,
        learnerResponse: fixture.learnerResponse,
      });
      const graded: GradedCriterion[] = result.criteria.map((c) => ({
        id: c.id,
        awarded: c.awarded,
      }));
      const verdict = evaluateFixture(fixture, graded);
      verdicts.push(verdict);

      const total = maxPoints(fixture.criteria);
      const awarded = Math.round(verdict.fraction * total);
      const flag = verdict.tooLenient ? "✗ TOO LENIENT" : verdict.withinBand ? "✓" : "·";
      console.log(
        `${flag}  ${fixture.id.padEnd(16)} ${fixture.category.padEnd(11)} ` +
          `got ${pct(verdict.fraction)} (${awarded}/${total} pts)  ` +
          `expected ${pct(fixture.expectedBand[0])}–${pct(fixture.expectedBand[1])}`,
      );
    } catch (err) {
      schemaFailures++;
      console.log(
        `✗  ${fixture.id.padEnd(16)} ${fixture.category.padEnd(11)} ` +
          `SCHEMA/CALL FAILURE: ${(err as Error).message}`,
      );
    }
  }

  const summary = summarize(verdicts);
  console.log("\n── Summary ─────────────────────────────────────────");
  console.log(`Model:               ${model}`);
  console.log(`Within expected band: ${summary.withinBand}/${summary.total}`);
  console.log(`Mean abs error:       ${pct(summary.meanAbsError)}`);
  console.log(`Schema/call failures: ${schemaFailures}`);
  console.log(
    `Leniency failures:    ${summary.strictnessFailures.length}` +
      (summary.strictnessFailures.length
        ? ` (${summary.strictnessFailures.map((v) => v.id).join(", ")})`
        : ""),
  );

  const passed = summary.passed && schemaFailures === 0;
  console.log(
    `\n${passed ? "✓ PASS" : "✗ FAIL"} — the cheap slot grades ${
      passed ? "at least as strictly as required" : "TOO LENIENTLY or unreliably"
    }.\n`,
  );
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
