import { existsSync } from "node:fs";
import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { BadArgument } from "@effect/platform/Error";
import { NodeHttpServer } from "@effect/platform-node";
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest";
import {
	AiProviderNotConfigured,
	Api,
	ExtractionFailed,
	InvalidFileType,
} from "@mamen/shared/contract";
import type { SpawnHandler } from "claude-code-effect";
import { Effect, Layer } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { OutboundStub } from "../net/test";
import { claudeCodeStoredTokenLayer, claudeCodeTestLayer } from "./test";

// The canned extraction the deep-fake `claude` returns for the CCF fixture: 6
// operations (5 Débit → negative, 1 Crédit → positive) plus the statement's
// printed `TOTAL DES OPÉRATIONS`. The debits sum to the declared 1929,71 and
// the single salary credit is the declared 1947,26 — the shape #45 reconciles.
const CCF_OBJECT = {
	transactions: [
		{ date: "2026-01-03", amount: -6.99, rawIssuerString: "CB AMAZON" },
		{ date: "2026-01-08", amount: -89.9, rawIssuerString: "PRLV EDF ENERGIE" },
		{
			date: "2026-01-12",
			amount: -152.34,
			rawIssuerString: "CB CARREFOUR MARKET PARIS",
		},
		{
			date: "2026-01-15",
			amount: 1947.26,
			rawIssuerString: "VIR SALAIRE ACME",
		},
		{ date: "2026-01-20", amount: -900, rawIssuerString: "VIR LOYER JANVIER" },
		{ date: "2026-01-27", amount: -780.48, rawIssuerString: "CB SNCF CONNECT" },
	],
	declaredTotals: { debit: 1929.71, credit: 1947.26 },
};

/** A success envelope carrying `structured_output` — the object read path. */
const okEnvelope = (object: unknown): string =>
	JSON.stringify({
		is_error: false,
		structured_output: object,
		result: JSON.stringify(object),
		session_id: "sess-ccf",
		modelUsage: { "claude-opus-4": {} },
		usage: { input_tokens: 10, output_tokens: 20 },
		total_cost_usd: 0.02,
	});

/** Build the full HTTP stack with a canned extraction handler wired in. */
const httpLiveWith = (handler: SpawnHandler) =>
	HttpApiBuilder.serve().pipe(
		Layer.provide(ApiLive),
		Layer.provide(claudeCodeTestLayer(handler)),
		Layer.provide(OutboundStub),
		Layer.provide(DatabaseTest),
		Layer.provideMerge(NodeHttpServer.layerTest),
	);

/**
 * The same stack, but with the CLI's token read from the **encrypted store**,
 * per call — the production config (issue #122). Everything above uses a pinned
 * dummy token, because the token is not their subject; these tests' subject is
 * exactly that read.
 */
const httpLiveWithStoredToken = (handler: SpawnHandler) =>
	HttpApiBuilder.serve().pipe(
		Layer.provide(ApiLive),
		Layer.provide(claudeCodeStoredTokenLayer(handler)),
		Layer.provide(OutboundStub),
		Layer.provide(DatabaseTest),
		Layer.provideMerge(NodeHttpServer.layerTest),
	);

/** A single-file `application/pdf` multipart upload (bytes are opaque here). */
const pdfFormData = (
	mime = "application/pdf",
	filename = "RLV_CHQ1_LUCAS_RIO_001.pdf",
): FormData => {
	const fd = new FormData();
	fd.append(
		"file",
		new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], filename, {
			type: mime,
		}),
	);
	return fd;
};

describe("import endpoints", () => {
	it.effect(
		"extractPdf returns the candidate transactions + declared totals",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const result = yield* client.import.extractPdf({
					payload: pdfFormData(),
				});

				// Re-decoded through the ExtractedTransaction schema: dates are Dates,
				// amounts keep their sign (Débit negative, Crédit positive).
				assert.strictEqual(result.transactions.length, 6);
				assert.strictEqual(result.transactions[0].rawIssuerString, "CB AMAZON");
				assert.strictEqual(result.transactions[0].amount, -6.99);
				assert.ok(result.transactions[0].date instanceof Date);
				assert.strictEqual(
					result.transactions[0].date.toISOString().slice(0, 10),
					"2026-01-03",
				);

				// The one credit stays positive.
				const credit = result.transactions.find((t) => t.amount > 0);
				assert.ok(credit);
				assert.strictEqual(credit?.amount, 1947.26);

				// declaredTotals mirrors the statement's printed TOTAL DES OPÉRATIONS.
				assert.deepStrictEqual(result.declaredTotals, {
					debit: 1929.71,
					credit: 1947.26,
				});
			}).pipe(
				Effect.provide(
					httpLiveWith(() =>
						Effect.succeed({
							stdout: okEnvelope(CCF_OBJECT),
							stderr: "",
							exitCode: 0,
						}),
					),
				),
			),
	);

	it.effect(
		"extractPdf drives the claude CLI read-only, scoped to the temp dir",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				yield* client.import.extractPdf({ payload: pdfFormData() });
			}).pipe(
				Effect.provide(
					httpLiveWith((input) => {
						// Read-only: only the Read tool is allowed, scoped by --add-dir, and
						// the prompt (stdin) names the staged statement.pdf.
						assert.ok(input.args.includes("--allowedTools"));
						assert.ok(input.args.includes("Read"));
						assert.ok(input.args.includes("--add-dir"));
						assert.ok(input.stdin.includes("statement.pdf"));
						return Effect.succeed({
							stdout: okEnvelope(CCF_OBJECT),
							stderr: "",
							exitCode: 0,
						});
					}),
				),
			),
	);

	it.effect(
		"extractPdf rejects a non-PDF upload with InvalidFileType (415)",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const error = yield* client.import
					.extractPdf({ payload: pdfFormData("image/png", "not-a.pdf") })
					.pipe(Effect.flip);

				assert.ok(error instanceof InvalidFileType);
				assert.strictEqual(error.received, "image/png");
				assert.deepStrictEqual([...error.allowed], ["application/pdf"]);
			}).pipe(
				Effect.provide(
					httpLiveWith(() =>
						Effect.succeed({
							stdout: okEnvelope(CCF_OBJECT),
							stderr: "",
							exitCode: 0,
						}),
					),
				),
			),
	);

	// Every claude-code-effect failure tag collapses to one client-visible
	// ExtractionFailed. A spawn failure (child never launched) stands in here.
	it.effect(
		"extractPdf collapses a spawn failure to ExtractionFailed (502)",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const error = yield* client.import
					.extractPdf({ payload: pdfFormData() })
					.pipe(Effect.flip);

				assert.ok(error instanceof ExtractionFailed);
			}).pipe(
				Effect.provide(
					httpLiveWith(() =>
						Effect.fail(
							new BadArgument({
								module: "Command",
								method: "start",
								description: "boom",
							}),
						),
					),
				),
			),
	);

	// An `is_error: true` envelope (quota / refusal / 4xx) is a different tag
	// (ClaudeApiError) and must collapse to the same single ExtractionFailed.
	it.effect(
		"extractPdf collapses an API-error envelope to ExtractionFailed",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const error = yield* client.import
					.extractPdf({ payload: pdfFormData() })
					.pipe(Effect.flip);

				assert.ok(error instanceof ExtractionFailed);
			}).pipe(
				Effect.provide(
					httpLiveWith(() =>
						Effect.succeed({
							stdout: JSON.stringify({
								is_error: true,
								result: "rate limited",
								api_error_status: 429,
							}),
							stderr: "",
							exitCode: 1,
						}),
					),
				),
			),
	);
});

/**
 * The **transient temp dir** (ADR 0005) survived the move onto the runner. The
 * staged copy is the sensitive artefact, so "it is gone afterwards" is asserted
 * against the filesystem rather than left to the shape of the code — and on the
 * failure path too, which is the one where a missing finalizer would show.
 */
describe("the staged PDF does not outlive the request", () => {
	/** The dir the CLI was scoped to — i.e. where the statement was staged. */
	const stagedIn = (args: ReadonlyArray<string>): string => {
		const dir = args[args.indexOf("--add-dir") + 1];
		assert.match(dir, /mamen-pdf-/);
		return dir;
	};

	it.effect("is deleted after a successful extraction", () => {
		let dir = "";
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.import.extractPdf({ payload: pdfFormData() });

			assert.isFalse(existsSync(dir));
		}).pipe(
			Effect.provide(
				httpLiveWith((input) => {
					dir = stagedIn(input.args);
					// Still there while the model is reading it — otherwise the
					// assertion below would pass for the wrong reason.
					assert.isTrue(existsSync(`${dir}/statement.pdf`));
					return Effect.succeed({
						stdout: okEnvelope(CCF_OBJECT),
						stderr: "",
						exitCode: 0,
					});
				}),
			),
		);
	});

	it.effect("is deleted after a failed extraction too", () => {
		let dir = "";
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.import
				.extractPdf({ payload: pdfFormData() })
				.pipe(Effect.flip);

			assert.isFalse(existsSync(dir));
		}).pipe(
			Effect.provide(
				httpLiveWith((input) => {
					dir = stagedIn(input.args);
					return Effect.fail(
						new BadArgument({
							module: "Command",
							method: "start",
							description: "boom",
						}),
					);
				}),
			),
		);
	});
});

/**
 * Extraction now runs through `ai-task-runner-effect` (issue #121), so the
 * stored provider/model choice is what selects the transport. Nothing above this
 * point changed — that is the behaviour-preserving half. What is new is below:
 * the choice reaching the CLI, and the choice being able to send the statement
 * somewhere else.
 */
describe("extraction runs on the stored choice", () => {
	it.effect("drives the CLI on the task's resolved model", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const resolved = yield* client.aiTasks.resolve({
				path: { task: "extract-pdf" },
			});
			yield* client.import.extractPdf({ payload: pdfFormData() });

			// A fresh install has chosen nothing, so this is the catalogue default —
			// the local CLI on its cheap model, asserted through the resolver rather
			// than restated, so moving the default moves both together.
			assert.strictEqual(resolved.provider, "claude-code");
			assert.strictEqual(resolved.model, "claude-haiku-4-5");
		}).pipe(
			Effect.provide(
				httpLiveWith((input) => {
					assert.ok(input.args.includes("--model"));
					assert.ok(input.args.includes("claude-haiku-4-5"));
					return Effect.succeed({
						stdout: okEnvelope(CCF_OBJECT),
						stderr: "",
						exitCode: 0,
					});
				}),
			),
		),
	);

	// The whole point of the previous tickets: a saved choice has to change what
	// actually runs, not just what a settings page renders back.
	it.effect("runs on a model the user saved, not the default", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.aiTasks.patch({
				payload: { tasks: [{ task: "extract-pdf", model: "claude-opus-5" }] },
			});
			const result = yield* client.import.extractPdf({
				payload: pdfFormData(),
			});

			// Same rows either way — the model is a transport choice, not a contract
			// change.
			assert.strictEqual(result.transactions.length, 6);
		}).pipe(
			Effect.provide(
				httpLiveWith((input) => {
					assert.ok(input.args.includes("claude-opus-5"));
					assert.ok(!input.args.includes("claude-haiku-4-5"));
					return Effect.succeed({
						stdout: okEnvelope(CCF_OBJECT),
						stderr: "",
						exitCode: 0,
					});
				}),
			),
		),
	);
});

/**
 * The Claude Code token is a **stored credential**, not an environment variable
 * (issue #122). The API starts without one, and the run is where its absence is
 * discovered — which is only acceptable because the failure is a distinct,
 * client-actionable error rather than the opaque retry-able one.
 *
 * Every test here runs the *production* config layer against a `:memory:`
 * database, so what is asserted is the real per-call read.
 */
describe("the Claude Code token comes from the credential store", () => {
	/** A plausible `claude setup-token` OAuth token; never a real one. */
	const TOKEN = "sk-ant-oat01-3fQ2xLmPqR7v-KjnW8sd";

	beforeEach(() => {
		process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
	});

	afterEach(() => {
		delete process.env.TOKEN_ENCRYPTION_KEY;
		delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
	});

	it.effect(
		"fails with AiProviderNotConfigured when no token has been pasted",
		() => {
			let spawned = false;
			return Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const error = yield* client.import
					.extractPdf({ payload: pdfFormData() })
					.pipe(Effect.flip);

				// Distinguishable from the generic collapse: this is the one extraction
				// failure a user can act on, and a client that could not tell it from
				// `ExtractionFailed` would offer a retry that cannot ever succeed.
				assert.ok(error instanceof AiProviderNotConfigured);
				assert.strictEqual(error.task, "extract-pdf");
				assert.strictEqual(error.provider, "claude-code");
				// The refusal arrives before a subprocess exists.
				assert.isFalse(spawned);
			}).pipe(
				Effect.provide(
					httpLiveWithStoredToken(() => {
						spawned = true;
						return Effect.succeed({
							stdout: okEnvelope(CCF_OBJECT),
							stderr: "",
							exitCode: 0,
						});
					}),
				),
			);
		},
	);

	// The ticket's "no fallback", asserted from the direction it would break: a
	// token left over in a deployment's environment must not quietly keep
	// extraction working after the store became its one home.
	it.effect("does not fall back to CLAUDE_CODE_OAUTH_TOKEN", () => {
		process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-from-the-environment";
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.import
				.extractPdf({ payload: pdfFormData() })
				.pipe(Effect.flip);

			assert.ok(error instanceof AiProviderNotConfigured);
		}).pipe(
			Effect.provide(
				httpLiveWithStoredToken(() =>
					Effect.succeed({
						stdout: okEnvelope(CCF_OBJECT),
						stderr: "",
						exitCode: 0,
					}),
				),
			),
		);
	});

	// The per-call resolution, asserted as the behaviour it exists for: one
	// server, one built layer, a token pasted between two uploads. With the value
	// form the second upload would fail exactly like the first until the process
	// was restarted.
	it.effect("runs the very next extraction after the token is pasted", () => {
		let childToken: string | undefined;
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);

			const before = yield* client.import
				.extractPdf({ payload: pdfFormData() })
				.pipe(Effect.flip);
			assert.ok(before instanceof AiProviderNotConfigured);

			// Pasted on the settings page like any other credential.
			const status = yield* client.secrets.put({
				path: { name: "claude-code" },
				payload: { value: TOKEN },
			});
			assert.isTrue(status.configured);
			// Outward it is a boolean and a masked hint, like every other credential
			// — the token itself does not come back.
			assert.notStrictEqual(status.hint, TOKEN);

			const result = yield* client.import.extractPdf({
				payload: pdfFormData(),
			});
			assert.strictEqual(result.transactions.length, 6);
			// And it is *that* token the CLI authenticated with.
			assert.strictEqual(childToken, TOKEN);
		}).pipe(
			Effect.provide(
				httpLiveWithStoredToken((input) => {
					childToken = input.env.CLAUDE_CODE_OAUTH_TOKEN;
					return Effect.succeed({
						stdout: okEnvelope(CCF_OBJECT),
						stderr: "",
						exitCode: 0,
					});
				}),
			),
		);
	});

	// The new error is one narrow exception, not a widening: with a token stored,
	// an upstream failure still collapses to the opaque tag (ADR 0005).
	it.effect("leaves every other failure collapsed to ExtractionFailed", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.secrets.put({
				path: { name: "claude-code" },
				payload: { value: TOKEN },
			});

			const error = yield* client.import
				.extractPdf({ payload: pdfFormData() })
				.pipe(Effect.flip);

			assert.ok(error instanceof ExtractionFailed);
		}).pipe(
			Effect.provide(
				httpLiveWithStoredToken(() =>
					Effect.fail(
						new BadArgument({
							module: "Command",
							method: "start",
							description: "boom",
						}),
					),
				),
			),
		),
	);
});

/**
 * The hosted branch is **not wired** (issue #121: only `claude-code` is), and
 * the previous ticket already lets a hosted provider be *stored*. So there is a
 * reachable state — a saved Anthropic key and a task moved onto it — where a
 * bank statement would otherwise be posted to a vendor under a prompt naming a
 * path on this machine. It must fail instead, and nothing may leave here.
 */
describe("a hosted provider does not run extraction yet", () => {
	const realFetch = globalThis.fetch;

	/**
	 * Every URL `fetch` was asked for while the test ran. The ai-sdk reaches a
	 * vendor through the global `fetch`, so this is where "the statement did not
	 * leave this machine" is actually observable — asserting only that the run
	 * failed would pass just as happily with the statement posted and the vendor
	 * call erroring afterwards.
	 */
	let fetched: Array<string> = [];

	afterEach(() => {
		delete process.env.TOKEN_ENCRYPTION_KEY;
		globalThis.fetch = realFetch;
		fetched = [];
	});

	it.effect("fails the run rather than sending the statement anywhere", () => {
		process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
		let spawned = false;
		globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			fetched.push(input instanceof Request ? input.url : String(input));
			return realFetch(input, init);
		}) as typeof fetch;

		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: "sk-ant-api03-Kj28fnQ2xLmPqR7v-3f9" },
			});
			yield* client.aiTasks.patch({
				payload: { tasks: [{ task: "extract-pdf", provider: "anthropic" }] },
			});

			const error = yield* client.import
				.extractPdf({ payload: pdfFormData() })
				.pipe(Effect.flip);

			// The same opaque failure every other upstream tag collapses to.
			assert.ok(error instanceof ExtractionFailed);
			// Nothing was posted to a vendor…
			assert.deepStrictEqual(
				fetched.filter((url) => !url.includes("localhost")),
				[],
			);
			// …and the local CLI was not quietly used as a fallback either: nothing
			// falls back, because the user chose which vendor sees their statement.
			assert.isFalse(spawned);
		}).pipe(
			Effect.provide(
				httpLiveWith(() => {
					spawned = true;
					return Effect.succeed({
						stdout: okEnvelope(CCF_OBJECT),
						stderr: "",
						exitCode: 0,
					});
				}),
			),
		);
	});

	/**
	 * The one state where a *hosted* provider reaches the run with no usable key
	 * (issue #122): the save-time doors read credential **presence** through the
	 * status boolean, and a blob that will not decrypt still reports `configured:
	 * true` — deliberately, so a rotated `TOKEN_ENCRYPTION_KEY` reads as
	 * "re-paste" rather than "nothing was ever here" (ADR 0011). The run is where
	 * the difference between present and *usable* is discovered, and it has to
	 * arrive as the actionable error, not the retry-able one.
	 */
	it.effect("reports a key that no longer decrypts as not configured", () => {
		process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);

		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: "sk-ant-api03-Kj28fnQ2xLmPqR7v-3f9" },
			});
			yield* client.aiTasks.patch({
				payload: { tasks: [{ task: "extract-pdf", provider: "anthropic" }] },
			});

			// The operator rotates the encryption key. The row survives; what it
			// holds is now unreadable.
			process.env.TOKEN_ENCRYPTION_KEY = "e".repeat(64);
			const statuses = yield* client.secrets.list();
			const anthropic = statuses.find((_) => _.name === "anthropic");
			assert.isTrue(anthropic?.configured);
			assert.strictEqual(anthropic?.hint, null);

			const error = yield* client.import
				.extractPdf({ payload: pdfFormData() })
				.pipe(Effect.flip);

			assert.ok(error instanceof AiProviderNotConfigured);
			assert.strictEqual(error.provider, "anthropic");
		}).pipe(
			Effect.provide(
				httpLiveWith(() =>
					Effect.succeed({
						stdout: okEnvelope(CCF_OBJECT),
						stderr: "",
						exitCode: 0,
					}),
				),
			),
		);
	});
});
