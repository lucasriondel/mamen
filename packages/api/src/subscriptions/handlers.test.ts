import { HttpApiBuilder, HttpApiClient, HttpClient } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
	Api,
	IssuerId,
	NotFound,
	type SubscriptionCreate,
	SubscriptionId,
	TransactionId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";

// Full API on a real ephemeral Node server over a fresh `:memory:` sqlite DB,
// with the derived HttpApiClient wired to it — every assertion round-trips the
// real contract encode/decode. Provided per test for an isolated, migrated DB.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(ClaudeCodeStub),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const asIssuer = Schema.decodeSync(IssuerId);
const asSubscription = Schema.decodeSync(SubscriptionId);
const asTransaction = Schema.decodeSync(TransactionId);

/** A valid create payload; override any field per test. */
const make = (over: Partial<SubscriptionCreate> = {}): SubscriptionCreate => ({
	issuerId: asIssuer(1),
	issuerName: "Netflix",
	typicalAmount: 15.99,
	frequency: "monthly",
	intervalDays: 30,
	lastChargeDate: "2026-03-01T00:00:00.000Z",
	firstChargeDate: "2026-01-01T00:00:00.000Z",
	chargeCount: 3,
	status: "active",
	transactionIds: [asTransaction(10), asTransaction(20)],
	detectedAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
	...over,
});

describe("subscriptions endpoints", () => {
	it.effect("list is empty initially", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const page = yield* client.subscriptions.list({
				urlParams: { limit: 50, offset: 0 },
			});
			assert.deepStrictEqual(page, { items: [], total: 0 });
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create returns 201 body; getFirstByIssuer round-trips it", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.subscriptions.create({
				payload: make({ issuerName: "Disney+" }),
			});
			assert.strictEqual(created.issuerName, "Disney+");
			assert.deepStrictEqual(created.transactionIds, [
				asTransaction(10),
				asTransaction(20),
			]);

			const fetched = yield* client.subscriptions.getFirstByIssuer({
				path: { issuerId: asIssuer(1) },
			});
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list paginates and reports the full total", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.subscriptions.create({ payload: make() });
			yield* client.subscriptions.create({ payload: make() });
			yield* client.subscriptions.create({ payload: make() });

			const page = yield* client.subscriptions.list({
				urlParams: { limit: 2, offset: 0 },
			});
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("list composes issuerId + status filters over the wire (AND)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.subscriptions.create({
				payload: make({ issuerId: asIssuer(1), status: "active" }),
			});
			yield* client.subscriptions.create({
				payload: make({
					issuerId: asIssuer(1),
					status: "possibly-cancelled",
				}),
			});
			yield* client.subscriptions.create({
				payload: make({ issuerId: asIssuer(2), status: "active" }),
			});

			const page = yield* client.subscriptions.list({
				urlParams: {
					limit: 50,
					offset: 0,
					issuerId: asIssuer(1),
					status: "active",
				},
			});
			assert.strictEqual(page.total, 1);
			assert.strictEqual(page.items[0]?.issuerId, asIssuer(1));
			assert.strictEqual(page.items[0]?.status, "active");
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByIssuerFrequency decodes the two-segment path", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.subscriptions.create({
				payload: make({ issuerId: asIssuer(5), frequency: "yearly" }),
			});
			const found = yield* client.subscriptions.getByIssuerFrequency({
				path: { issuerId: asIssuer(5), frequency: "yearly" },
			});
			assert.strictEqual(found.frequency, "yearly");
			assert.strictEqual(found.issuerId, asIssuer(5));
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update applies a partial change", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.subscriptions.create({
				payload: make({ chargeCount: 3 }),
			});
			const updated = yield* client.subscriptions.update({
				path: { id: created.id },
				payload: { chargeCount: 9, status: "possibly-cancelled" },
			});
			assert.strictEqual(updated.chargeCount, 9);
			assert.strictEqual(updated.status, "possibly-cancelled");
			assert.strictEqual(updated.id, created.id);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getFirstByIssuer 404s when the issuer has none", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.subscriptions
				.getFirstByIssuer({ path: { issuerId: asIssuer(999) } })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "subscription", id: asIssuer(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("getByIssuerFrequency 404s on no match", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.subscriptions.create({
				payload: make({ issuerId: asIssuer(1), frequency: "monthly" }),
			});
			const error = yield* client.subscriptions
				.getByIssuerFrequency({
					path: { issuerId: asIssuer(1), frequency: "weekly" },
				})
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "subscription", id: "weekly" }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update 404s on a missing id", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.subscriptions
				.update({
					path: { id: asSubscription(999) },
					payload: { chargeCount: 1 },
				})
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "subscription", id: asSubscription(999) }),
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	// A bad `frequency` path segment fails the `Schema.Literal` decode → 400 — the
	// ticket's "validated literal, was an unchecked cast" AC. The typed client
	// won't let us send an off-union value (it'd fail client-side encode), so hit
	// the raw route with the underlying HttpClient bound to the test server.
	it.effect("getByIssuerFrequency rejects an invalid frequency with 400", () =>
		Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			const res = yield* http.get(
				"/api/subscriptions/by-issuer-frequency/1/daily",
			);
			assert.strictEqual(res.status, 400);
		}).pipe(Effect.provide(HttpLive)),
	);
});
