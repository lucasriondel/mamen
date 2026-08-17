import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest";
import type { HostedGenerate } from "ai-task-runner-effect";
import { Effect, Layer } from "effect";
import { TaskProvider } from "../ai-tasks";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { SecretsRepo } from "../secrets/repository";
import { HostedTransport } from "./hosted";
import { extractionPrompt, HOSTED_EXTRACTION_INSTRUCTION } from "./prompt";
import { AiRunner } from "./service";

/**
 * The **hosted branch of the runner** (issue #124, PRD #115).
 *
 * `import/handlers.test.ts` covers what a client gets back from the endpoint;
 * what is here is what reached the **vendor** — asserted at the one new seam
 * ({@link HostedTransport}), which is the argument the package exposes for
 * exactly this. Nothing is mocked: the real table, the real codec, the real
 * resolver and the real credential reader all run, and only the HTTP call at
 * the far end is a function this file wrote.
 *
 * The distinctions this file exists for are the ones the endpoint deliberately
 * flattens. A vendor call that failed and a payload the codec refused are one
 * opaque `ExtractionFailed` to a browser (ADR 0005) and two different tags here
 * — and "the key did not leak" is a property of the error the transport built,
 * which no client ever sees.
 */

/** A well-formed extraction payload — the shape `ExtractPdfResult` decodes. */
const PAYLOAD = {
	transactions: [
		{ date: "2026-01-03", amount: -6.99, rawIssuerString: "CB AMAZON" },
		{
			date: "2026-01-15",
			amount: 1947.26,
			rawIssuerString: "VIR SALAIRE ACME",
		},
	],
	declaredTotals: { debit: 6.99, credit: 1947.26 },
};

/** The staged statement's bytes — opaque here; what matters is they arrive. */
const PDF_BYTES = new Uint8Array([
	0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
]);

const INPUT = {
	pdfPath: "/tmp/mamen-pdf-abc/statement.pdf",
	pdfBytes: PDF_BYTES,
};

const ANTHROPIC_KEY = "sk-ant-api03-Kj28fnQ2xLmPqR7v-3f9";
const GOOGLE_KEY = "AIzaSyB-Qw3xTn7Lp0aa11bb22cc33dd44ee";

/** Every call the hosted seam saw, and a fake that answers with `respond`. */
const recorder = (respond: () => Promise<unknown>) => {
	const calls: Array<Parameters<HostedGenerate>[0]> = [];
	const generate: HostedGenerate = (args) => {
		calls.push(args);
		return respond();
	};
	return { calls, generate };
};

/**
 * The runner over a fresh `:memory:` database, with `generate` standing in for
 * the one HTTP call. Everything between the task table and that call is real —
 * including the `ClaudeCode` service, which is present precisely so that "the
 * CLI was not used as a fallback" is a claim about a transport that was
 * available rather than one that was missing.
 */
const runnerWith = (generate: HostedGenerate) =>
	Layer.mergeAll(
		AiRunner.Default,
		SecretsRepo.Default,
		TaskProvider.Default,
		ClaudeCodeStub,
	).pipe(
		Layer.provide(Layer.succeed(HostedTransport, generate)),
		Layer.provideMerge(DatabaseTest),
	);

/**
 * Store `key` for `provider` and move extraction onto it — through the same
 * doors the settings page uses, so the state under test is one a user could
 * actually have reached.
 */
const chooseHosted = (
	provider: "anthropic" | "google",
	model: string,
	key: string,
) =>
	Effect.gen(function* () {
		const secrets = yield* SecretsRepo;
		yield* secrets.put(provider, key);
		const tasks = yield* TaskProvider;
		yield* tasks.patch([{ task: "extract-pdf", provider, model }]);
	});

beforeEach(() => {
	process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
});

afterEach(() => {
	delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("the hosted branch sends the statement to the chosen vendor", () => {
	it.effect("attaches the statement as a document part, not as text", () => {
		const { calls, generate } = recorder(() => Promise.resolve(PAYLOAD));

		return Effect.gen(function* () {
			yield* chooseHosted("anthropic", "claude-haiku-4-5", ANTHROPIC_KEY);
			const runner = yield* AiRunner;
			yield* runner.run("extract-pdf", INPUT);

			assert.strictEqual(calls.length, 1);
			assert.deepStrictEqual(calls[0]?.document, {
				data: PDF_BYTES,
				mediaType: "application/pdf",
			});
		}).pipe(Effect.provide(runnerWith(generate)));
	});

	it.effect("sends the hosted prompt column and never the CLI one", () => {
		const { calls, generate } = recorder(() => Promise.resolve(PAYLOAD));

		return Effect.gen(function* () {
			yield* chooseHosted("anthropic", "claude-haiku-4-5", ANTHROPIC_KEY);
			const runner = yield* AiRunner;
			yield* runner.run("extract-pdf", INPUT);

			const call = calls[0];
			// The CLI column names a path on this machine and tells the model to
			// open it with a tool the vendor does not have. Neither may travel.
			assert.notInclude(call?.system ?? "", INPUT.pdfPath);
			assert.notInclude(call?.system ?? "", "Read tool");
			assert.notStrictEqual(call?.system, extractionPrompt(INPUT.pdfPath));
			// …and the user turn the document rides beside is the task's own.
			assert.strictEqual(call?.prompt, HOSTED_EXTRACTION_INSTRUCTION);
		}).pipe(Effect.provide(runnerWith(generate)));
	});

	it.effect("carries the same extraction semantics as the CLI column", () => {
		const { calls, generate } = recorder(() => Promise.resolve(PAYLOAD));

		return Effect.gen(function* () {
			yield* chooseHosted("anthropic", "claude-haiku-4-5", ANTHROPIC_KEY);
			const runner = yield* AiRunner;
			yield* runner.run("extract-pdf", INPUT);

			// The rules block is the correctness surface of PDF import, and the two
			// columns share one copy of it — so this is the assertion that the
			// hosted turn is an *extraction* prompt and not a stand-in.
			const system = calls[0]?.system ?? "";
			for (const rule of [
				"SIGN CONVENTION",
				"DATE",
				"NUMBERS (French format)",
				"LABEL",
				"ROWS TO EXCLUDE",
				"DECLARED TOTALS",
			]) {
				assert.include(system, rule);
			}
		}).pipe(Effect.provide(runnerWith(generate)));
	});

	it.effect("sends the selected model id and that vendor's own key", () => {
		const { calls, generate } = recorder(() => Promise.resolve(PAYLOAD));

		return Effect.gen(function* () {
			// Two keys stored, the task moved onto the second vendor: the run must
			// spend the key belonging to the provider it is calling.
			const secrets = yield* SecretsRepo;
			yield* secrets.put("anthropic", ANTHROPIC_KEY);
			yield* chooseHosted("google", "gemini-2.5-pro", GOOGLE_KEY);

			const runner = yield* AiRunner;
			yield* runner.run("extract-pdf", INPUT);

			const call = calls[0];
			assert.strictEqual(call?.vendor, "google");
			assert.strictEqual(call?.modelId, "gemini-2.5-pro");
			assert.strictEqual(call?.apiKey, GOOGLE_KEY);
		}).pipe(Effect.provide(runnerWith(generate)));
	});

	it.effect("decodes the vendor's payload through the task's codec", () => {
		const { generate } = recorder(() => Promise.resolve(PAYLOAD));

		return Effect.gen(function* () {
			yield* chooseHosted("anthropic", "claude-haiku-4-5", ANTHROPIC_KEY);
			const runner = yield* AiRunner;
			const { output, model } = yield* runner.run("extract-pdf", INPUT);

			// Same decode as the CLI branch: dates become Dates, signs survive.
			assert.strictEqual(output.transactions.length, 2);
			assert.ok(output.transactions[0]?.date instanceof Date);
			assert.strictEqual(output.transactions[0]?.amount, -6.99);
			assert.strictEqual(output.transactions[1]?.amount, 1947.26);
			assert.deepStrictEqual(output.declaredTotals, {
				debit: 6.99,
				credit: 1947.26,
			});
			assert.strictEqual(model, "claude-haiku-4-5");
		}).pipe(Effect.provide(runnerWith(generate)));
	});
});

describe("a hosted failure is not recoverable by trying elsewhere", () => {
	it.effect(
		"a payload the codec refuses is a schema failure, not a vendor one",
		() => {
			// A well-formed HTTP response carrying the wrong object: the vendor did
			// its job and the model broke its contract. Told apart because the two
			// have different fixes — retrying is worth it for one and not the other.
			const { generate } = recorder(() =>
				Promise.resolve({ transactions: [{ date: "nope" }] }),
			);

			return Effect.gen(function* () {
				yield* chooseHosted("anthropic", "claude-haiku-4-5", ANTHROPIC_KEY);
				const runner = yield* AiRunner;
				const error = yield* Effect.flip(runner.run("extract-pdf", INPUT));

				assert.strictEqual(error._tag, "TaskSchemaError");
			}).pipe(Effect.provide(runnerWith(generate)));
		},
	);

	it.effect("a vendor refusal fails the run and calls no one else", () => {
		const { calls, generate } = recorder(() =>
			Promise.reject(new Error("429 rate limited")),
		);

		return Effect.gen(function* () {
			yield* chooseHosted("anthropic", "claude-haiku-4-5", ANTHROPIC_KEY);
			const runner = yield* AiRunner;
			const error = yield* Effect.flip(runner.run("extract-pdf", INPUT));

			assert.strictEqual(error._tag, "HostedApiError");
			// Nothing falls back: the user chose which vendor sees their statement,
			// and a different vendor is not an acceptable recovery. One call, to
			// the one provider that was chosen.
			assert.strictEqual(calls.length, 1);
			assert.strictEqual(calls[0]?.vendor, "anthropic");
		}).pipe(Effect.provide(runnerWith(generate)));
	});

	it.effect("a vendor error quoting the key does not carry it out", () => {
		// Vendor SDKs quote what they were handed, credentials included.
		const { generate } = recorder(() =>
			Promise.reject(new Error(`401 invalid x-api-key: ${ANTHROPIC_KEY}`)),
		);

		return Effect.gen(function* () {
			yield* chooseHosted("anthropic", "claude-haiku-4-5", ANTHROPIC_KEY);
			const runner = yield* AiRunner;
			const error = yield* Effect.flip(runner.run("extract-pdf", INPUT));

			assert.notInclude(JSON.stringify(error), ANTHROPIC_KEY);
		}).pipe(Effect.provide(runnerWith(generate)));
	});
});
