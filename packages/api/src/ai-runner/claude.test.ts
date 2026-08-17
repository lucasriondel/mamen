import { readdirSync, readFileSync, statSync } from "node:fs";
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest";
import {
	ClaudeConfig,
	type ClaudeConfigService,
	ClaudeTokenMissingError,
} from "claude-code-effect";
import { Effect, Layer, Redacted } from "effect";
import { DatabaseTest } from "../db/test";
import { SecretsRepo } from "../secrets/repository";
import { ClaudeConfigStored } from "./claude";

/**
 * The Claude Code token's config layer (issue #122, PRD #115).
 *
 * `import/handlers.test.ts` covers what a client gets back; what is here is the
 * property that has no client — **the API starts with no token stored** — and
 * the mechanism that trade rests on, that the token resolves per call rather
 * than once at layer build. Both were build-time facts before this ticket, so
 * neither is observable through an endpoint: a regression to the value form
 * would take the whole server down at boot, which is a test that has to build a
 * layer and not one that has to make a request.
 */

/** Every `.ts` file under `src`, as `[package-relative path, contents]`. */
function sources(dir = "src"): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const entry of readdirSync(dir)) {
		const path = `${dir}/${entry}`;
		if (statSync(path).isDirectory()) {
			out.push(...sources(path));
		} else if (entry.endsWith(".ts")) {
			out.push([path, readFileSync(path, "utf8")]);
		}
	}
	return out;
}

/** The layer under test, over a fresh migrated `:memory:` database. */
const configLive = ClaudeConfigStored.pipe(Layer.provideMerge(DatabaseTest));

/** The token effect — the effect form is the thing being asserted, so unwrap it. */
const tokenOf = (config: ClaudeConfigService) => {
	assert.isFalse(
		Redacted.isRedacted(config.token),
		"the token must be the effect form, resolved per call",
	);
	return config.token as Effect.Effect<
		Redacted.Redacted<string>,
		ClaudeTokenMissingError
	>;
};

/** Paste a token the way the settings page does, through the outward repository. */
const store = (value: string) =>
	Effect.flatMap(SecretsRepo, (secrets) => secrets.put("claude-code", value));

describe("the CLI's config reads its token from the credential store", () => {
	// Storing anything needs a key; the token is a credential like any other.
	beforeEach(() => {
		process.env.TOKEN_ENCRYPTION_KEY = "d".repeat(64);
	});

	afterEach(() => {
		delete process.env.TOKEN_ENCRYPTION_KEY;
		delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
	});

	it.effect("builds with nothing stored, so the API still starts", () =>
		Effect.gen(function* () {
			// Building it *is* the assertion: this layer's error channel is `never`,
			// so a missing token can no longer fail `ServerLive` at boot. What is
			// left to check is that the token became a per-call question.
			const config = yield* ClaudeConfig;

			assert.isFalse(Redacted.isRedacted(config.token));
			assert.strictEqual(config.binPath, "claude");
		}).pipe(Effect.provide(configLive)),
	);

	it.effect(
		"fails the call with ClaudeTokenMissingError when none is stored",
		() =>
			Effect.gen(function* () {
				const config = yield* ClaudeConfig;
				const error = yield* Effect.flip(tokenOf(config));

				assert.ok(error instanceof ClaudeTokenMissingError);
			}).pipe(Effect.provide(configLive)),
	);

	// The whole reason for the effect form: one config, built once, answering
	// differently after a paste. The value form would answer the same both times
	// until the process restarted.
	it.effect("resolves per call, so a token pasted now runs the next call", () =>
		Effect.gen(function* () {
			const config = yield* ClaudeConfig;
			const token = tokenOf(config);

			assert.ok((yield* Effect.flip(token)) instanceof ClaudeTokenMissingError);

			yield* store("sk-ant-oat01-3fQ2xLmPqR7v-KjnW8sd");

			assert.strictEqual(
				Redacted.value(yield* token),
				"sk-ant-oat01-3fQ2xLmPqR7v-KjnW8sd",
			);
		}).pipe(Effect.provide(SecretsRepo.Default), Effect.provide(configLive)),
	);

	// The env fallback is gone from the code, not only from this wiring: the SDK
	// still ships `ClaudeConfigLive`, which reads `CLAUDE_CODE_OAUTH_TOKEN` and
	// would restore the second home with one import. Prose about the variable is
	// what the tests around this one are for, so this looks for the read.
	it("has no module left that reads the token from the environment", () => {
		const readers = sources()
			.filter(([path]) => !path.endsWith(".test.ts"))
			.filter(
				([, source]) =>
					// The import, not the word — the comment above names the layer it
					// replaced, and prose is not a second home for a token.
					/import\s*\{[^}]*\bClaudeConfigLive\b[^}]*\}\s*from\s*"claude-code-effect"/.test(
						source,
					) ||
					/Config\.\w+\(\s*"CLAUDE_CODE_OAUTH_TOKEN"/.test(source) ||
					/process\.env\.CLAUDE_CODE_OAUTH_TOKEN/.test(source),
			)
			.map(([path]) => path);

		assert.deepStrictEqual(readers, []);
	});

	// No fallback: a token in the environment is not a token mamen has.
	it.effect("does not read CLAUDE_CODE_OAUTH_TOKEN", () =>
		Effect.gen(function* () {
			process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-from-the-environment";
			const config = yield* ClaudeConfig;

			const error = yield* Effect.flip(tokenOf(config));

			assert.ok(error instanceof ClaudeTokenMissingError);
		}).pipe(Effect.provide(configLive)),
	);
});
