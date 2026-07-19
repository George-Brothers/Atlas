/**
 * Swappable AI provider module.
 *
 * A thin wrapper over the Vercel AI SDK that exposes two named model slots —
 * "strong" and "cheap" — resolved from config. Swapping providers or model ids
 * later means editing only this file.
 *
 * PROVIDER (direct DeepSeek): the live "cheap" slot (the strict free-text
 * grader) calls **DeepSeek's API directly** via `@ai-sdk/deepseek` — no Vercel
 * AI Gateway, no token middleman. The captain has a DeepSeek key and does not
 * use Vercel's gateway (it requires pre-buying a Vercel balance even for BYOK).
 *   - cheap  → `deepseek-v4-flash` (the strict free-text grader; DeepSeek's
 *              flash-class chat model: cheap, fast, and JSON-structured-output
 *              capable — the live, non-legacy id verified against DeepSeek's
 *              /models API). `deepseek-v4-pro` is the heavier chat id the provider
 *              ships (slower/pricier — not what we want for the grader).
 *   - strong → NOT wired to a live provider yet. atlas makes exactly one live
 *              call today (the cheap-slot grader). The strong slot gets a
 *              **direct Google (Gemini) provider** when M4/vision lands; until
 *              then `getModel("strong")` fails clearly rather than calling a dead
 *              gateway. `DEFAULT_MODELS.strong` is a documented placeholder id.
 * Both slots are overridable per-environment via `AI_CHEAP_MODEL` /
 * `AI_STRONG_MODEL` with no code change (any id the underlying provider accepts,
 * e.g. `AI_CHEAP_MODEL=deepseek-v4-pro`).
 *
 * Building a handle does not hit the API; the metered call is reserved for the
 * live loop (the grader). Authoring/build stay offline.
 *
 * Auth: DeepSeek authenticates via `DEEPSEEK_API_KEY`. Fail-closed: `getModel`
 * throws a clear error when it is unset — but only when actually asked for a
 * model, so imports (and the build) never require a credential.
 */
import { createDeepSeek } from "@ai-sdk/deepseek";
import { type LanguageModel } from "ai";

export type ModelSlot = "strong" | "cheap";

/**
 * Default model id per slot.
 *   - cheap: a direct DeepSeek model id passed straight to DeepSeek's API.
 *   - strong: a documented placeholder — the direct Google/Gemini provider that
 *     backs this slot lands with M4/vision. Not callable until then.
 * Overridable via `AI_STRONG_MODEL` / `AI_CHEAP_MODEL` (see `resolveModelId`).
 */
export const DEFAULT_MODELS: Record<ModelSlot, string> = {
  strong: "gemini-2.5-flash",
  cheap: "deepseek-v4-flash",
};

/**
 * Resolve the model id for a slot, applying the env override when present.
 * Pure and env-injectable so the routing is unit-testable without a network.
 */
export function resolveModelId(
  slot: ModelSlot,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = slot === "strong" ? env.AI_STRONG_MODEL : env.AI_CHEAP_MODEL;
  return override?.trim() || DEFAULT_MODELS[slot];
}

/**
 * Snapshot of the resolved ids at import time (convenience / diagnostics).
 * `getModel` re-resolves per call, so runtime overrides still take effect.
 */
export const AI_MODELS: Record<ModelSlot, string> = {
  strong: resolveModelId("strong"),
  cheap: resolveModelId("cheap"),
};

/**
 * The DeepSeek API key, or undefined if none is configured. Exported so
 * callers/tests (e.g. the grader eval) can check configuration without
 * constructing a provider.
 */
export function getDeepSeekApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env.DEEPSEEK_API_KEY;
  return value && value.trim() ? value : undefined;
}

let deepseekProvider: ReturnType<typeof createDeepSeek> | undefined;

/**
 * Lazily construct the direct DeepSeek provider. Throws a clear, fail-closed
 * error if `DEEPSEEK_API_KEY` is unset — but only when a model is actually
 * requested, never at import time.
 */
function getDeepSeekProvider(): ReturnType<typeof createDeepSeek> {
  if (!deepseekProvider) {
    const apiKey = getDeepSeekApiKey();
    if (!apiKey) {
      throw new Error(
        "No DeepSeek credential found. Set DEEPSEEK_API_KEY (direct DeepSeek " +
          "API key). See .env.example.",
      );
    }
    deepseekProvider = createDeepSeek({ apiKey });
  }
  return deepseekProvider;
}

/**
 * Resolve a language model handle for the given slot. Constructing the handle
 * does not call the API; pass it to the AI SDK (e.g. `generateObject`) to run
 * it.
 *
 *   - cheap: a direct DeepSeek model (the live grader path).
 *   - strong: not wired to a live provider yet — throws a clear error. The
 *     direct Google/Gemini provider that backs it lands with M4/vision; wire it
 *     into this branch then.
 */
export function getModel(slot: ModelSlot = "cheap"): LanguageModel {
  if (slot === "strong") {
    throw new Error(
      `The "strong" slot ("${resolveModelId("strong")}") has no live provider ` +
        "yet. atlas makes exactly one live call today: the cheap-slot grader on " +
        "direct DeepSeek. The strong slot gets a direct Google (Gemini) provider " +
        "when M4/vision lands — wire it into getModel() in lib/ai/index.ts then.",
    );
  }
  return getDeepSeekProvider()(resolveModelId(slot));
}
