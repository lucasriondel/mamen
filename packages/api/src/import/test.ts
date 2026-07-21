import {
	type ClaudeCode,
	ClaudeCodeLive,
	ClaudeCodeTest,
	ClaudeConfig,
	type SpawnHandler,
} from "claude-code-effect";
import { Duration, Effect, Layer, Option, Redacted } from "effect";

/**
 * Test wiring for the `ClaudeCode` service — the analog of {@link DatabaseTest}
 * for PDF extraction. Both the import handler test and every other handler test
 * (which builds the full `ApiLive`, now carrying the `import` group) need a
 * `ClaudeCode` in context; these helpers supply one backed by the SDK's
 * deep-fake executor, so no real `claude` binary or token is ever needed in CI.
 *
 * A fixed config (dummy token, 120s timeout) stands in for the env-read
 * `ClaudeConfigLive`, so the build-time token check never fires under test.
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
export const claudeCodeTestLayer = (
	handler: SpawnHandler,
): Layer.Layer<ClaudeCode> =>
	ClaudeCodeLive.pipe(
		Layer.provide(ClaudeCodeTest.handler(handler)),
		Layer.provide(TestConfig),
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
