import type { SqlClient } from "@effect/sql";
import {
  type ClaudeCode,
  ClaudeCodeLive,
  ClaudeCodeTest,
  ClaudeConfig,
  type SpawnHandler,
} from "claude-code-effect";
import { Duration, Effect, Layer, Option, Redacted } from "effect";
import { ClaudeConfigStored } from "../ai-runner/claude";

/**
 * Test wiring for the `ClaudeCode` service — the analog of {@link DatabaseTest}
 * for PDF extraction. Both the import handler test and every other handler test
 * (which builds the full `ApiLive`, now carrying the `import` group) need a
 * `ClaudeCode` in context; these helpers supply one backed by the SDK's
 * deep-fake executor, so no real `claude` binary or token is ever needed in CI.
 *
 * There are two config forms, because since issue #122 production has one that a
 * fixed literal cannot stand in for:
 *
 * - {@link claudeCodeTestLayer} pins a dummy token, for the suites whose subject
 *   is anything but the token — extraction's rows, the temp dir, the failure
 *   collapse — and for the many handler tests that must satisfy `ApiLive`'s
 *   `ClaudeCode` requirement without ever calling it.
 * - {@link claudeCodeStoredTokenLayer} builds on the **production**
 *   {@link ClaudeConfigStored}, so a test that is about the stored token
 *   exercises the real per-call read against a `:memory:` database rather than a
 *   second implementation of it. It requires `SqlClient` for that reason.
 */
const TestConfig = Layer.succeed(ClaudeConfig, {
  token: Redacted.make("test-token"),
  binPath: "claude",
  defaultModel: Option.none(),
  timeout: Duration.millis(120_000),
});

/**
 * Build a `ClaudeCode` layer whose spawns are answered by `handler` — the real
 * `spawn` + parser run against its canned capture, so a test exercises the full
 * extraction path minus the process launch. Failure injection is uniform:
 * `Effect.fail(PlatformError)` → `ClaudeSpawnError`; an envelope-bearing capture
 * lets the parser derive the rest.
 */
export const claudeCodeTestLayer = (handler: SpawnHandler): Layer.Layer<ClaudeCode> =>
  ClaudeCodeLive.pipe(Layer.provide(ClaudeCodeTest.handler(handler)), Layer.provide(TestConfig));

/**
 * The same deep-fake spawn, over the **production** config — so the token comes
 * from the encrypted store, per call, exactly as it does in `ServerLive`.
 *
 * What this makes testable is the whole of issue #122: that a token pasted
 * through `PUT /secrets/claude-code` reaches the child process's environment,
 * that one never pasted is a per-request failure rather than a dead API, and
 * that the environment is not consulted either way. Requires `SqlClient`, which
 * a handler test already has from {@link DatabaseTest}.
 */
export const claudeCodeStoredTokenLayer = (
  handler: SpawnHandler,
): Layer.Layer<ClaudeCode, never, SqlClient.SqlClient> =>
  ClaudeCodeLive.pipe(
    Layer.provide(ClaudeCodeTest.handler(handler)),
    Layer.provide(ClaudeConfigStored),
  );

/**
 * A benign `ClaudeCode` stub for the many handler tests that never touch the
 * import endpoint but must still satisfy `ApiLive`'s `ClaudeCode` requirement.
 * It answers any spawn with a minimal success envelope; no test that provides it
 * ever calls extraction, so the body is never read.
 */
export const ClaudeCodeStub = claudeCodeTestLayer(() =>
  Effect.succeed({
    stdout: JSON.stringify({
      is_error: false,
      result: "{}",
      session_id: "stub",
      modelUsage: { claude: {} },
      usage: { input_tokens: 0, output_tokens: 0 },
      total_cost_usd: 0,
    }),
    stderr: "",
    exitCode: 0,
  }),
);
