import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test so each gets an isolated,
// migrated database.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(ClaudeCodeStub),
	Layer.provide(OutboundStub),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

/**
 * Seed one row in every table through the resource endpoints and return the
 * created entities. Exercises the whole DB so `export`/`import` round-trip a
 * representative dump (every table non-empty, with ids the server assigned).
 * Foreign keys reference the seeded rows (transaction → account/issuer/category,
 * rule → issuer, subscription → issuer/transaction) so the dependency-order
 * load is meaningful.
 */
const seed = Effect.gen(function* () {
	const client = yield* HttpApiClient.make(Api);
	const account = yield* client.accounts.create({
		payload: { name: "Checking", type: "checking" },
	});
	// A folder + a leaf under it: the issuer default must be an assignable leaf,
	// never a folder (two-level invariant, ADR 0001).
	const folder = yield* client.categories.create({
		payload: {
			name: "Food",
			slug: "food",
			color: "#0f0",
			icon: "folder",
			parentId: null,
			sortOrder: 1,
		},
	});
	const category = yield* client.categories.create({
		payload: {
			name: "Groceries",
			slug: "groceries",
			color: "#0f0",
			icon: "cart",
			parentId: folder.id,
			sortOrder: 1,
		},
	});
	// Give the issuer a default category equal to the seeded category so the
	// transaction's category — read *through* the issuer at query time (a
	// non-manual row derives `issuer.defaultCategoryId`, per the derived-category
	// model) — matches its stored `categoryId` on read-back. Without this the
	// issuer has no default and `getById` would derive an absent category, while
	// `create`/`export` echo the stored id, so the round-trip would diverge.
	const issuer = yield* client.issuers.create({
		payload: {
			name: "Store",
			defaultCategoryId: category.id,
			firstSeen: new Date("2026-01-01T00:00:00.000Z"),
		},
	});
	const rule = yield* client.rules.create({
		payload: {
			issuerId: issuer.id,
			pattern: "STORE*",
		},
	});
	const transaction = yield* client.transactions.create({
		payload: {
			accountId: account.id,
			date: new Date("2026-02-15T12:00:00.000Z"),
			amount: -42.5,
			rawIssuerString: "STORE #1",
			issuerId: issuer.id,
			categoryId: category.id,
			isRefund: false,
			importedAt: new Date("2026-02-16T00:00:00.000Z"),
			importMonth: "2026-02",
		},
	});
	const subscription = yield* client.subscriptions.create({
		payload: {
			issuerId: issuer.id,
			issuerName: "Store",
			typicalAmount: 9.99,
			frequency: "monthly",
			intervalDays: 30,
			lastChargeDate: "2026-02-01",
			firstChargeDate: "2026-01-01",
			chargeCount: 2,
			status: "active",
			transactionIds: [transaction.id],
			detectedAt: "2026-02-02",
			updatedAt: "2026-02-02",
		},
	});
	const setting = yield* client.settings.putByKey({
		payload: { id: 1, key: "currency_symbol", value: "$" } as never,
	});
	const appSettings = yield* client.appSettings.put({
		payload: {
			id: "app",
			llm: {
				endpoint: "http://localhost:11434",
				modelName: "llama3",
				provider: "ollama",
			},
		} as never,
	});
	return {
		account,
		category,
		issuer,
		rule,
		transaction,
		subscription,
		setting,
		appSettings,
	};
});

/** A dump with every table empty — the shape a wiped DB exports. */
const EMPTY_DUMP = {
	accounts: [],
	transactions: [],
	issuers: [],
	rules: [],
	categories: [],
	subscriptions: [],
	settings: [],
	appSettings: [],
};

describe("database endpoints", () => {
	it.effect(
		"export on a fresh DB is empty but for the seeded category tree",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const dump = yield* client.database.export();

				// A fresh migrated DB ships the seeded categories (migration 0010) —
				// 6 folders + their leaves — and nothing else.
				assert.strictEqual(
					dump.categories.filter((c) => c.parentId === null).length,
					6,
				);
				assert.ok(
					dump.categories.every((c) => c.parentId === null || c.id > 0),
				);
				assert.ok(dump.categories.length > 6);
				assert.deepStrictEqual({ ...dump, categories: [] }, EMPTY_DUMP);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("export captures every seeded table", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const seeded = yield* seed;

			const dump = yield* client.database.export();
			assert.deepStrictEqual(dump.accounts, [seeded.account]);
			// The dump carries the seeded tree plus the one this test created.
			assert.ok(
				dump.categories.some(
					(c) => c.id === seeded.category.id && c.slug === "groceries",
				),
			);
			assert.deepStrictEqual(dump.issuers, [seeded.issuer]);
			// The dump is *storage*, so a rule comes back as the stored `Rule` — the
			// create echoed the richer `RuleView`, whose `ownedCount` is derived on
			// read and never a column (issue #63). Compare the stored fields.
			assert.strictEqual(dump.rules.length, 1);
			const [dumpedRule] = dump.rules;
			assert.strictEqual(dumpedRule?.id, seeded.rule.id);
			assert.strictEqual(dumpedRule?.issuerId, seeded.rule.issuerId);
			assert.strictEqual(dumpedRule?.pattern, seeded.rule.pattern);
			assert.strictEqual(
				dumpedRule?.createdAt.getTime(),
				seeded.rule.createdAt.getTime(),
			);
			assert.deepStrictEqual(dump.transactions, [seeded.transaction]);
			assert.deepStrictEqual(dump.subscriptions, [seeded.subscription]);
			assert.deepStrictEqual(dump.settings, [seeded.setting]);
			assert.deepStrictEqual(dump.appSettings, [seeded.appSettings]);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("reset wipes all 8 tables", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed;

			const ack = yield* client.database.reset();
			assert.deepStrictEqual(ack, { ok: true });

			const dump = yield* client.database.export();
			assert.deepStrictEqual(dump, EMPTY_DUMP);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("round-trip: export → reset → import restores state exactly", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const seeded = yield* seed;

			const dump = yield* client.database.export();
			yield* client.database.reset();
			const ack = yield* client.database.import({ payload: dump });
			assert.deepStrictEqual(ack, { ok: true });

			// The restored dump equals the original — ids and all fields preserved.
			const restored = yield* client.database.export();
			assert.deepStrictEqual(restored, dump);

			// And the entities are reachable by their original ids (import kept them).
			const account = yield* client.accounts.getById({
				path: { id: seeded.account.id },
			});
			assert.deepStrictEqual(account, seeded.account);
			const transaction = yield* client.transactions.getById({
				path: { id: seeded.transaction.id },
			});
			assert.deepStrictEqual(transaction, seeded.transaction);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("import is destructive: existing rows are cleared first", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed;
			const dump = yield* client.database.export();

			// Import a payload with a single different account — everything else in
			// the dump (and the existing DB) must be gone.
			yield* client.database.import({
				payload: { accounts: [{ ...dump.accounts[0], name: "Replaced" }] },
			});

			const after = yield* client.database.export();
			assert.strictEqual(after.accounts.length, 1);
			assert.strictEqual(after.accounts[0].name, "Replaced");
			// Every table absent from the payload was still wiped.
			assert.deepStrictEqual(after.categories, []);
			assert.deepStrictEqual(after.issuers, []);
			assert.deepStrictEqual(after.rules, []);
			assert.deepStrictEqual(after.transactions, []);
			assert.deepStrictEqual(after.subscriptions, []);
			assert.deepStrictEqual(after.settings, []);
			assert.deepStrictEqual(after.appSettings, []);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("import of an empty payload wipes everything", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed;

			const ack = yield* client.database.import({ payload: {} });
			assert.deepStrictEqual(ack, { ok: true });

			const dump = yield* client.database.export();
			assert.deepStrictEqual(dump, EMPTY_DUMP);
		}).pipe(Effect.provide(HttpLive)),
	);
});
