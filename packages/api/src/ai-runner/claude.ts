import { BunContext } from "@effect/platform-bun";
import { SqlClient } from "@effect/sql";
import type { SecretName } from "@mamen/shared/contract";
import {
	type ClaudeCode,
	ClaudeCodeLive,
	ClaudeConfig,
	ClaudeTokenMissingError,
} from "claude-code-effect";
import { Config, Duration, Effect, Layer, Option } from "effect";
import { readSecret } from "../secrets/repository";

/**
 * The Claude Code CLI transport's configuration (issue #122, PRD #115) — the
 * `claude-code-effect` config layer, with its token read from the **encrypted
 * credential store** rather than from the environment.
 *
 * `CLAUDE_CODE_OAUTH_TOKEN` is gone, and there is **no fallback**: a token
 * nobody pasted does not exist. That is the ticket rather than a simplification
 * of it — a credential mamen also reads from the environment is a credential
 * with two homes, one of which goes on looking live in a deployment config long
 * after it has stopped being read.
 *
 * The token is the **effect form** of `ClaudeConfig.token` (claude-code-effect
 * 0.2.0), so it resolves **per call**. That is what makes a token pasted a
 * moment ago run the very next extraction: the value form is read once when the
 * layer is built, so picking up a new one would mean rebuilding the layer per
 * request — a layer build on the hot path, and a production wiring no test could
 * resemble. It also moves `ClaudeTokenMissingError` from a build-time failure of
 * this layer into the per-call error channel of both `ClaudeCode` methods, which
 * is exactly the trade this ticket accepts: the API now starts with no token
 * stored, and a missing one is a per-request failure the settings page can
 * explain (see `import/extract.ts`, which turns that tag into the one
 * client-visible, client-actionable extraction error).
 *
 * The other three fields still come from the environment, unchanged from the
 * SDK's own `ClaudeConfigLive`: where the binary is and how long a run may take
 * are facts of the machine running the CLI, not credentials, and nothing about
 * this ticket makes them settings. (`defaultModel` only applies to a call that
 * names no model; the runner always names one, resolved from the task's stored
 * choice.)
 *
 * Reading the token is a **deep import of `readSecret`** — the secrets module's
 * inward plaintext reader, kept off its barrel on purpose (ADR 0011). This is
 * the second of its two in-process callers, beside the runner's own
 * `credential`; nothing here decrypts, and the value stays `Redacted` until the
 * SDK writes it into the child process's environment.
 */

/** The credential store's name for the CLI's token: the provider it belongs to. */
const CLAUDE_CODE: SecretName = "claude-code";

export const ClaudeConfigStored: Layer.Layer<
	ClaudeConfig,
	never,
	SqlClient.SqlClient
> = Layer.effect(
	ClaudeConfig,
	Effect.gen(function* () {
		// Closed over rather than required per call: the token effect is handed to
		// a service that knows nothing of mamen's context, so it has to carry its
		// own database handle.
		const sql = yield* SqlClient.SqlClient;

		// All three carry a default or an option, so their residual `ConfigError`
		// is unreachable; `orDie` clears it, leaving this layer unable to fail at
		// build — which is the ticket's "the API starts with no token stored".
		const binPath = yield* Config.string("CLAUDE_BIN").pipe(
			Config.withDefault("claude"),
			Effect.orDie,
		);
		const defaultModel = yield* Config.string("CLAUDE_MODEL").pipe(
			Config.option,
			Effect.orDie,
		);
		const timeout = yield* Config.number("CLAUDE_TIMEOUT_MS").pipe(
			Config.withDefault(120_000),
			Config.map(Duration.millis),
			Effect.orDie,
		);

		return {
			token: readSecret(CLAUDE_CODE).pipe(
				Effect.provideService(SqlClient.SqlClient, sql),
				Effect.flatMap(
					Option.match({
						// Nothing stored, or what is stored will not decrypt. Both are one
						// operational fact here — there is no usable token — and the
						// settings page is what tells them apart, through the status.
						onNone: () => Effect.fail(new ClaudeTokenMissingError()),
						onSome: Effect.succeed,
					}),
				),
			),
			binPath,
			defaultModel,
			timeout,
		};
	}),
);

/**
 * The production `ClaudeCode` service: the stored-token config above plus the
 * `CommandExecutor` the CLI spawn needs. Only `ClaudeCode` is exposed — the
 * platform context provided here is not re-exported — and `SqlClient` is left to
 * the caller, which in `ServerLive` is the same database layer every repository
 * is built on.
 *
 * Tests never use this one: they provide `ClaudeCode` through `ClaudeCodeTest`'s
 * deep-fake executor, over either config form, so no real binary and no real
 * token is needed in CI.
 *
 * The `claude` CLI itself remains a runtime **operational dependency** (local
 * dev and deploy); see `docs/operations/claude-cli-dependency.md` and ADR 0005.
 */
export const ClaudeCodeProdLive: Layer.Layer<
	ClaudeCode,
	never,
	SqlClient.SqlClient
> = ClaudeCodeLive.pipe(
	Layer.provide(ClaudeConfigStored),
	Layer.provide(BunContext.layer),
);
