import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { BadArgument } from "@effect/platform/Error";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Api, ExtractionFailed, InvalidFileType } from "@mamen/shared/contract";
import type { SpawnHandler } from "claude-code-effect";
import { Effect, Layer } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { OutboundStub } from "../net/test";
import { claudeCodeTestLayer } from "./test";

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
