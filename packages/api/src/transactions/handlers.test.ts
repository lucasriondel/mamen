import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
	AccountId,
	AnomalyFlag,
	Api,
	CategoryId,
	MerchantId,
	NotFound,
	type TransactionCreate,
	TransactionId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB.
// Exercises the transactions group end-to-end through the derived typed client —
// the same path the SDK uses — so filters, ordering, and the anomaly-flag codec
// are all verified over the wire.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const asAccount = Schema.decodeSync(AccountId);
const asCategory = Schema.decodeSync(CategoryId);
const asMerchant = Schema.decodeSync(MerchantId);
const asTx = Schema.decodeSync(TransactionId);

const DATE = new Date("2026-03-01T00:00:00.000Z");

const make = (over: Partial<TransactionCreate> = {}): TransactionCreate => ({
	accountId: asAccount(1),
	date: DATE,
	amount: 42.5,
	rawMerchantString: "ACME STORE",
	importedAt: DATE,
	importMonth: "2026-03",
	...over,
});

describe("transactions endpoints", () => {
	it.effect("list is empty initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.transactions.list({
				urlParams: { limit: 50, offset: 0, direction: "desc" },
			});
			assert.deepStrictEqual(page, { items: [], total: 0 });
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create returns 201 body and getById round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.create({
				payload: make({ amount: 12.34, rawMerchantString: "Coffee" }),
			});
			assert.strictEqual(created.amount, 12.34);
			assert.strictEqual(created.rawMerchantString, "Coffee");
			assert.strictEqual(created.merchantId, undefined);

			const fetched = yield* client.transactions.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("anomalyFlags round-trip over the wire through the SDK client", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const flags = [
				new AnomalyFlag({
					type: "new-merchant",
					reason: "first time",
					detectedAt: "2026-03-01T00:00:00.000Z",
					dismissed: false,
				}),
			];
			const created = yield* client.transactions.create({
				payload: make({ anomalyFlags: flags }),
			});
			assert.deepStrictEqual(created.anomalyFlags, flags);

			const fetched = yield* client.transactions.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched.anomalyFlags, flags);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update applies a partial change and returns the full resource", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.create({
				payload: make({ amount: 10 }),
			});
			const updated = yield* client.transactions.update({
				path: { id: created.id },
				payload: { amount: 20, categoryId: asCategory(5) },
			});
			assert.strictEqual(updated.amount, 20);
			assert.strictEqual(updated.categoryId, asCategory(5));
			assert.strictEqual(updated.id, created.id);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove deletes the transaction (getById then 404s)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.create({ payload: make() });
			yield* client.transactions.remove({ path: { id: created.id } });

			const error = yield* client.transactions
				.getById({ path: { id: created.id } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "transaction", id: created.id }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	// --- Composable filters over the wire: the core redesign (ticket AC) --------

	// Seed three diverse rows through the client, so every filter has matching and
	// non-matching data. Typed off a concrete `HttpApiClient.make(Api)` call so the
	// client shape stays in sync with the contract without hand-writing it.
	const makeClient = () => HttpApiClient.make(Api);
	type ApiClient = Effect.Effect.Success<ReturnType<typeof makeClient>>;
	const seed = (client: ApiClient) =>
		Effect.all([
			client.transactions.create({
				payload: make({
					accountId: asAccount(1),
					categoryId: asCategory(7),
					merchantId: asMerchant(2),
					date: new Date("2026-01-10T00:00:00.000Z"),
					importMonth: "2026-01",
					isRefund: true,
				}),
			}),
			client.transactions.create({
				payload: make({
					accountId: asAccount(1),
					categoryId: asCategory(8),
					date: new Date("2026-02-10T00:00:00.000Z"),
					importMonth: "2026-02",
				}),
			}),
			client.transactions.create({
				payload: make({
					accountId: asAccount(2),
					categoryId: asCategory(7),
					date: new Date("2026-03-10T00:00:00.000Z"),
					importMonth: "2026-03",
				}),
			}),
		]);

	it.effect("accountId + categoryId + startDate compose over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed(client);
			const page = yield* client.transactions.list({
				urlParams: {
					limit: 50,
					offset: 0,
					direction: "desc",
					accountId: asAccount(1),
					categoryId: asCategory(7),
					startDate: new Date("2026-01-01T00:00:00.000Z"),
				},
			});
			assert.strictEqual(page.total, 1);
			assert.strictEqual(page.items[0]?.importMonth, "2026-01");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("importMonth alone filters over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed(client);
			const page = yield* client.transactions.list({
				urlParams: {
					limit: 50,
					offset: 0,
					direction: "desc",
					importMonth: "2026-02",
				},
			});
			assert.strictEqual(page.total, 1);
			assert.strictEqual(page.items[0]?.importMonth, "2026-02");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("startDate alone filters over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed(client);
			const page = yield* client.transactions.list({
				urlParams: {
					limit: 50,
					offset: 0,
					direction: "desc",
					startDate: new Date("2026-02-01T00:00:00.000Z"),
				},
			});
			assert.strictEqual(page.total, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("orderBy date asc orders the page over the wire", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed(client);
			const page = yield* client.transactions.list({
				urlParams: {
					limit: 50,
					offset: 0,
					orderBy: "date",
					direction: "asc",
				},
			});
			assert.deepStrictEqual(
				page.items.map((t) => t.importMonth),
				["2026-01", "2026-02", "2026-03"],
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("count honors the same filters as list", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed(client);

			const all = yield* client.transactions.count({ urlParams: {} });
			assert.strictEqual(all.count, 3);

			const byAccount = yield* client.transactions.count({
				urlParams: { accountId: asAccount(1) },
			});
			assert.strictEqual(byAccount.count, 2);

			const combined = yield* client.transactions.count({
				urlParams: {
					accountId: asAccount(1),
					categoryId: asCategory(7),
					startDate: new Date("2026-01-01T00:00:00.000Z"),
				},
			});
			assert.strictEqual(combined.count, 1);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("isRefund boolean filter decodes from the query string", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* seed(client);
			const refunds = yield* client.transactions.list({
				urlParams: { limit: 50, offset: 0, direction: "desc", isRefund: true },
			});
			assert.strictEqual(refunds.total, 1);
		}).pipe(Effect.provide(HttpLive)),
	);

	// --- NotFound (ticket AC) ---------------------------------------------------

	it.effect("getById 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.transactions
				.getById({ path: { id: asTx(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "transaction", id: asTx(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.transactions
				.update({ path: { id: asTx(999) }, payload: { amount: 1 } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "transaction", id: asTx(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("remove 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.transactions
				.remove({ path: { id: asTx(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "transaction", id: asTx(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);
});
