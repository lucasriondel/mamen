import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";
import { ExtractPdfResult } from "@mamen/shared/contract";
import { Effect, Schema } from "effect";
import { effectSchemaCodec } from "./codec";

/**
 * The **Effect Schema codec adapter** (issue #121) — the whole reason zod does
 * not come back to mamen. `ObjectCodec` wants two halves, a JSON Schema and a
 * decode returning an Effect, and Effect Schema already has both; this suite
 * pins the one place the translation is not mechanical.
 */

/** What `ObjectCodec.jsonSchema` is, once past the `unknown` it is declared as. */
const asObject = (schema: unknown): Record<string, unknown> =>
	schema as Record<string, unknown>;

/** The workspace's `packages/` directory, from this file rather than the cwd. */
const PACKAGES = fileURLToPath(new URL("../../../", import.meta.url));

describe("the reason this adapter exists", () => {
	// The runner's task table wants an `ObjectCodec`, and its README reaches one
	// through `zod-to-json-schema`. mamen's contract is already Effect Schema
	// throughout, so a zod copy of `ExtractPdfResult` would be a second
	// definition of one contract with the drift between them as the bug. The
	// adapter is what makes that unnecessary, so the claim is a test.
	it("means no mamen package depends on zod", () => {
		// A directory under `packages/` is only a package if it has a manifest —
		// stale build output from a renamed package leaves the rest behind.
		const packages = readdirSync(PACKAGES).filter((name) =>
			existsSync(`${PACKAGES}${name}/package.json`),
		);

		const withZod = packages.filter((name) => {
			const manifest = JSON.parse(
				readFileSync(`${PACKAGES}${name}/package.json`, "utf8"),
			) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			return (
				"zod" in (manifest.dependencies ?? {}) ||
				"zod" in (manifest.devDependencies ?? {})
			);
		});

		assert.deepStrictEqual(withZod, []);
	});
});

describe("the JSON schema handed to the model", () => {
	// The load-bearing assertion. `JSONSchema.make` emits a bare top-level
	// `{ $ref }` for an identifier-annotated root — every `Schema.Class`, so every
	// contract class mamen owns. The CLI forwards that into the Anthropic tool
	// `input_schema`, which requires a top-level `type`, and the run dies as an
	// API 400 nothing in mamen would explain. claude-code-effect repairs it on
	// its own `Schema` branch and deliberately does not on the codec branch — a
	// JSON Schema someone else built is not its to rewrite — so it is ours.
	it("has a top-level type, not a bare root $ref", () => {
		const root = asObject(effectSchemaCodec(ExtractPdfResult).jsonSchema);

		assert.strictEqual(root.type, "object");
		assert.notProperty(root, "$ref");
	});

	it("keeps $defs, so the inner refs still resolve", () => {
		const root = asObject(effectSchemaCodec(ExtractPdfResult).jsonSchema);
		const defs = asObject(root.$defs);

		// `transactions` items still point at `#/$defs/ExtractedTransaction`.
		assert.property(defs, "ExtractedTransaction");
		assert.property(defs, "DeclaredTotals");
	});

	it("leaves a root that already carries a type untouched", () => {
		const root = asObject(
			effectSchemaCodec(Schema.Struct({ n: Schema.Number })).jsonSchema,
		);

		assert.strictEqual(root.type, "object");
		assert.notProperty(root, "$defs");
	});
});

describe("decoding the model's answer", () => {
	it.effect("re-decodes through the schema, transforms and all", () =>
		Effect.gen(function* () {
			const decoded = yield* effectSchemaCodec(ExtractPdfResult).decode({
				transactions: [
					{ date: "2026-01-03", amount: -6.99, rawIssuerString: "CB AMAZON" },
				],
				declaredTotals: { debit: 6.99, credit: 0 },
			});

			// The encoded side is what the model answers in (an ISO string); the
			// decoded side is the contract's own type. That transform is the reason
			// the decode half exists at all.
			assert.instanceOf(decoded, ExtractPdfResult);
			assert.instanceOf(decoded.transactions[0].date, Date);
			assert.strictEqual(
				decoded.transactions[0].date.toISOString().slice(0, 10),
				"2026-01-03",
			);
		}),
	);

	it.effect("fails with the validator's own issues, not a ParseError", () =>
		Effect.gen(function* () {
			// `issues` reaches the caller untouched (it becomes
			// `ClaudeSchemaError.issues` / `TaskSchemaError.issues`), so it has to be
			// something a log line can print. A `ParseError` is not.
			const issues = yield* effectSchemaCodec(ExtractPdfResult)
				.decode({ transactions: "not an array" })
				.pipe(Effect.flip);

			assert.isArray(issues);
			assert.isAbove((issues as ReadonlyArray<unknown>).length, 0);
			const [first] = issues as ReadonlyArray<{
				readonly path: ReadonlyArray<PropertyKey>;
				readonly message: string;
			}>;
			assert.deepStrictEqual([...first.path], ["transactions"]);
			assert.isString(first.message);
		}),
	);
});
