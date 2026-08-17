import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import type { HostedGenerate } from "ai-task-runner-effect";
import type { SpawnHandler } from "claude-code-effect";
import { Effect, Layer } from "effect";
import { HostedTransport } from "../ai-runner";
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

/** The Anthropic key these tests paste. Long enough for the store to accept. */
const ANTHROPIC_KEY = "sk-ant-api03-Kj28fnQ2xLmPqR7v-3f9";

/**
 * The same stack with the hosted transport faked (issue #124) — the one new
 * seam, and the only thing about a hosted run these tests stand in for. The CLI
 * handler stays real and answers with the canned envelope by default, so "the
 * CLI was not used" is a claim about a transport that was there.
 */
const httpLiveWithHosted = (
	generate: HostedGenerate,
	handler: SpawnHandler = () =>
		Effect.succeed({
			stdout: okEnvelope(CCF_OBJECT),
			stderr: "",
			exitCode: 0,
		}),
) =>
	httpLiveWith(handler).pipe(
		Layer.provide(Layer.succeed(HostedTransport, generate)),
	);

/** Every call the hosted seam saw, and a fake that answers with `respond`. */
const hostedRecorder = (respond: () => Promise<unknown>) => {
	const calls: Array<Parameters<HostedGenerate>[0]> = [];
	const generate: HostedGenerate = (args) => {
		calls.push(args);
		return respond();
	};
	return { calls, generate };
};

/**
 * The transient temp dir this request staged its statement in, found by its
 * contents.
 *
 * The hosted turn deliberately carries no path — that is the whole point of the
 * second prompt column — so the dir cannot be read off the call the way
 * {@link stagedIn} reads it off the CLI's `--add-dir`. Matching on the uploaded
 * bytes instead identifies *this* request's dir unambiguously, even with another
 * extraction in flight in a parallel test file.
 */
const stagedDirOf = (marker: Uint8Array): string => {
	const root = tmpdir();
	for (const name of readdirSync(root)) {
		if (!name.startsWith("mamen-pdf-")) continue;
		const file = join(root, name, "statement.pdf");
		if (existsSync(file) && Buffer.from(readFileSync(file)).equals(marker)) {
			return join(root, name);
		}
	}
	return "";
};

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

/** The four bytes every upload here carries unless a test wants its own. */
const PDF_MAGIC = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);

/** A single-file `application/pdf` multipart upload (bytes are opaque here). */
const pdfFormData = (
	mime = "application/pdf",
	filename = "RLV_CHQ1_LUCAS_RIO_001.pdf",
	bytes: Uint8Array<ArrayBuffer> = PDF_MAGIC,
): FormData => {
	const fd = new FormData();
	fd.append("file", new File([bytes], filename, { type: mime }));
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
 * The hosted branch **runs** (issue #124), so the reachable state the previous
 * ticket had to refuse — a saved Anthropic key and the task moved onto it — is
 * now the feature. What a client gets back must be indistinguishable from the
 * CLI branch's answer, and the CLI must not be reached at all.
 */
describe("a hosted provider extracts the statement", () => {
	afterEach(() => {
		delete process.env.TOKEN_ENCRYPTION_KEY;
	});

	/** Move extraction onto Anthropic, the way the settings page does. */
	const chooseAnthropic = Effect.gen(function* () {
		const client = yield* HttpApiClient.make(Api);
		yield* client.secrets.put({
			path: { name: "anthropic" },
			payload: { value: ANTHROPIC_KEY },
		});
		yield* client.aiTasks.patch({
			payload: { tasks: [{ task: "extract-pdf", provider: "anthropic" }] },
		});
	});

	it.effect("returns the same rows and declared totals as the CLI does", () => {
		process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
		let spawned = false;
		const { calls, generate } = hostedRecorder(() =>
			Promise.resolve(CCF_OBJECT),
		);

		return Effect.gen(function* () {
			yield* chooseAnthropic;
			const client = yield* HttpApiClient.make(Api);
			const result = yield* client.import.extractPdf({
				payload: pdfFormData(),
			});

			// Byte-for-byte the assertions the CLI branch's first test makes.
			assert.strictEqual(result.transactions.length, 6);
			assert.strictEqual(result.transactions[0].rawIssuerString, "CB AMAZON");
			assert.strictEqual(result.transactions[0].amount, -6.99);
			assert.ok(result.transactions[0].date instanceof Date);
			assert.strictEqual(
				result.transactions[0].date.toISOString().slice(0, 10),
				"2026-01-03",
			);
			const credit = result.transactions.find((t) => t.amount > 0);
			assert.strictEqual(credit?.amount, 1947.26);
			assert.deepStrictEqual(result.declaredTotals, {
				debit: 1929.71,
				credit: 1947.26,
			});

			// The uploaded file itself went to the vendor — the same four bytes the
			// multipart body carried, as a document and not as text.
			assert.deepStrictEqual(calls[0]?.document, {
				data: PDF_MAGIC,
				mediaType: "application/pdf",
			});
			// Nothing falls back, in either direction: the CLI was available and
			// was not used.
			assert.isFalse(spawned);
		}).pipe(
			Effect.provide(
				httpLiveWithHosted(generate, () => {
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

	it.effect(
		"collapses a vendor refusal to ExtractionFailed, key and all",
		() => {
			process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
			const { generate } = hostedRecorder(() =>
				// The shape of a real 401: the vendor quotes back what it was handed.
				Promise.reject(new Error(`401 invalid x-api-key: ${ANTHROPIC_KEY}`)),
			);

			return Effect.gen(function* () {
				yield* chooseAnthropic;
				const client = yield* HttpApiClient.make(Api);
				const error = yield* client.import
					.extractPdf({ payload: pdfFormData() })
					.pipe(Effect.flip);

				// The same deliberately opaque 502 the CLI branch's failures collapse
				// to (ADR 0005) — and nothing of the vendor's message came with it.
				assert.ok(error instanceof ExtractionFailed);
				assert.notInclude(JSON.stringify(error), ANTHROPIC_KEY);
				assert.notInclude(JSON.stringify(error), "x-api-key");
			}).pipe(Effect.provide(httpLiveWithHosted(generate)));
		},
	);

	it.effect("deletes the statement whichever way the vendor answers", () => {
		process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
		// Bytes unique to this test, so the staged dir is found by its contents
		// and no parallel extraction can be mistaken for it.
		const marker = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x32]);
		let staged = "";

		return Effect.gen(function* () {
			yield* chooseAnthropic;
			const client = yield* HttpApiClient.make(Api);
			yield* client.import
				.extractPdf({
					payload: pdfFormData("application/pdf", "RLV.pdf", marker),
				})
				.pipe(Effect.flip);

			// It was staged while the vendor call was in flight (ADR 0005's temp
			// dir is transport-independent, and the failure path is where a missing
			// finalizer would show) — and it is gone now.
			assert.match(staged, /mamen-pdf-/);
			assert.isFalse(existsSync(staged));
		}).pipe(
			Effect.provide(
				httpLiveWithHosted(() => {
					staged = stagedDirOf(marker);
					return Promise.reject(new Error("503 upstream unavailable"));
				}),
			),
		);
	});

	/**
	 * The seam above stands in for the HTTP call, so on its own it would pass just
	 * as happily against a runner that never makes one. This test provides **no**
	 * seam — the production wiring, the package's own ai-sdk call — and stubs
	 * `fetch` one layer lower, at the socket the vendor is on.
	 *
	 * It is what actually holds the acceptance criterion "sent as a base64
	 * document part": the base64 is the ai-sdk's doing, not mamen's, and this is
	 * the only place mamen can see it. The stub answers with a 400 so the SDK
	 * gives up rather than retrying, and the run's failure is beside the point —
	 * what is asserted is the request that left.
	 */
	it.effect("posts the statement to the chosen vendor for real", () => {
		process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
		const realFetch = globalThis.fetch;
		const requests: Array<{ url: string; headers: Headers; body: string }> = [];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url = input instanceof Request ? input.url : String(input);
			if (!url.includes("localhost")) {
				requests.push({
					url,
					headers: new Headers(init?.headers),
					body: String(init?.body ?? ""),
				});
				return new Response(JSON.stringify({ error: { message: "nope" } }), {
					status: 400,
					headers: { "content-type": "application/json" },
				});
			}
			return realFetch(input, init);
		}) as typeof fetch;

		return Effect.gen(function* () {
			yield* chooseAnthropic;
			const client = yield* HttpApiClient.make(Api);
			yield* client.aiTasks.patch({
				payload: { tasks: [{ task: "extract-pdf", model: "claude-opus-5" }] },
			});
			yield* client.import
				.extractPdf({ payload: pdfFormData() })
				.pipe(Effect.flip);

			assert.strictEqual(requests.length, 1);
			const request = requests[0];
			assert.ok(request);
			// The vendor the user chose, with the vendor's own key…
			assert.include(request.url, "api.anthropic.com");
			assert.strictEqual(request.headers.get("x-api-key"), ANTHROPIC_KEY);
			// …the model they chose…
			const body = JSON.parse(request.body) as {
				model: string;
				system?: unknown;
				messages: Array<{ content: Array<Record<string, unknown>> }>;
			};
			assert.strictEqual(body.model, "claude-opus-5");
			// …and the statement itself, base64, beside the instruction.
			const parts = body.messages[0]?.content ?? [];
			const document = parts.find((part) => part.type === "document") as
				| { source: { type: string; media_type: string; data: string } }
				| undefined;
			assert.ok(document, `no document part in ${JSON.stringify(parts)}`);
			assert.strictEqual(document?.source.type, "base64");
			assert.strictEqual(document?.source.media_type, "application/pdf");
			assert.strictEqual(
				document?.source.data,
				Buffer.from(PDF_MAGIC).toString("base64"),
			);
			// The CLI column never travels: no path on this machine, no tool.
			assert.notInclude(request.body, "statement.pdf");
			assert.notInclude(request.body, "Read tool");
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
			Effect.ensuring(
				Effect.sync(() => {
					globalThis.fetch = realFetch;
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
