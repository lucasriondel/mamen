import { assert, describe, it } from "@effect/vitest";
import {
	IssuerId,
	NotFound,
	Subscription,
	type SubscriptionCreate,
	SubscriptionId,
	TransactionId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { SubscriptionFromRow, SubscriptionRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `SubscriptionRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = SubscriptionRepo.Default.pipe(Layer.provide(DatabaseTest));

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

describe("SubscriptionFromRow storage codec", () => {
	// The row codec's `encode` is the storage inverse of the read path. Verify
	// decode∘encode = id — this pins the `transactionIds` JSON parse/stringify in
	// both directions and keeps the inverse from silently drifting.
	const encode = Schema.encodeSync(SubscriptionFromRow);
	const decode = Schema.decodeSync(SubscriptionFromRow);

	it("round-trips a subscription (transactionIds ↔ JSON TEXT)", () => {
		const full = new Subscription({
			id: asSubscription(1),
			issuerId: asIssuer(2),
			issuerName: "Spotify",
			typicalAmount: 9.99,
			frequency: "yearly",
			intervalDays: 365,
			lastChargeDate: "2026-06-01T00:00:00.000Z",
			firstChargeDate: "2025-06-01T00:00:00.000Z",
			chargeCount: 2,
			status: "possibly-cancelled",
			transactionIds: [asTransaction(7), asTransaction(8)],
			detectedAt: "2025-06-01T00:00:00.000Z",
			updatedAt: "2026-06-01T00:00:00.000Z",
		});
		const row = encode(full);
		assert.strictEqual(row.transactionIds, "[7,8]");
		assert.strictEqual(row.frequency, "yearly");
		assert.deepStrictEqual(decode(row), full);
	});

	it("round-trips an empty transactionIds array", () => {
		const bare = new Subscription({
			id: asSubscription(1),
			issuerId: asIssuer(2),
			issuerName: "X",
			typicalAmount: 1,
			frequency: "weekly",
			intervalDays: 7,
			lastChargeDate: "2026-01-01T00:00:00.000Z",
			firstChargeDate: "2026-01-01T00:00:00.000Z",
			chargeCount: 2,
			status: "active",
			transactionIds: [],
			detectedAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		const row = encode(bare);
		assert.strictEqual(row.transactionIds, "[]");
		assert.deepStrictEqual(decode(row), bare);
	});
});

describe("SubscriptionRepo", () => {
	it.effect("create assigns an id, then a lookup returns it", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			const created = yield* repo.create(make({ issuerName: "Hulu" }));
			assert.strictEqual(created.issuerName, "Hulu");
			assert.strictEqual(created.issuerId, asIssuer(1));
			assert.ok(created.id > 0);
			assert.deepStrictEqual(created.transactionIds, [
				asTransaction(10),
				asTransaction(20),
			]);

			const fetched = yield* repo.getFirstByIssuer(asIssuer(1));
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("create preserves the caller-supplied date strings verbatim", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			const created = yield* repo.create(
				make({
					lastChargeDate: "not-a-date",
					detectedAt: "2020-12-31T23:59:59.000Z",
				}),
			);
			// Faithful port: dates are opaque strings, stored/returned unchanged.
			assert.strictEqual(created.lastChargeDate, "not-a-date");
			assert.strictEqual(created.detectedAt, "2020-12-31T23:59:59.000Z");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list returns items and the full count", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			yield* repo.create(make());
			yield* repo.create(make());

			const page = yield* repo.list({ limit: 50, offset: 0 });
			assert.strictEqual(page.total, 2);
			assert.strictEqual(page.items.length, 2);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list honors limit/offset while total stays the full set", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			yield* repo.create(make());
			yield* repo.create(make());
			yield* repo.create(make());

			const page = yield* repo.list({ limit: 1, offset: 1 });
			assert.strictEqual(page.total, 3);
			assert.strictEqual(page.items.length, 1);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list filters by issuerId (total reflects the filter)", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			yield* repo.create(make({ issuerId: asIssuer(1) }));
			yield* repo.create(make({ issuerId: asIssuer(1) }));
			yield* repo.create(make({ issuerId: asIssuer(2) }));

			const page = yield* repo.list({
				limit: 50,
				offset: 0,
				issuerId: asIssuer(1),
			});
			assert.strictEqual(page.total, 2);
			assert.ok(page.items.every((s) => s.issuerId === asIssuer(1)));
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list filters by status", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			yield* repo.create(make({ status: "active" }));
			yield* repo.create(make({ status: "active" }));
			yield* repo.create(make({ status: "possibly-cancelled" }));

			const page = yield* repo.list({
				limit: 50,
				offset: 0,
				status: "possibly-cancelled",
			});
			assert.strictEqual(page.total, 1);
			assert.strictEqual(page.items[0]?.status, "possibly-cancelled");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("list composes issuerId AND status (both must match)", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			yield* repo.create(make({ issuerId: asIssuer(1), status: "active" }));
			yield* repo.create(
				make({ issuerId: asIssuer(1), status: "possibly-cancelled" }),
			);
			yield* repo.create(make({ issuerId: asIssuer(2), status: "active" }));

			const page = yield* repo.list({
				limit: 50,
				offset: 0,
				issuerId: asIssuer(1),
				status: "active",
			});
			assert.strictEqual(page.total, 1);
			assert.strictEqual(page.items[0]?.issuerId, asIssuer(1));
			assert.strictEqual(page.items[0]?.status, "active");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getFirstByIssuer returns the lowest-id match", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			const first = yield* repo.create(
				make({ issuerId: asIssuer(9), issuerName: "first" }),
			);
			yield* repo.create(make({ issuerId: asIssuer(9), issuerName: "second" }));
			const found = yield* repo.getFirstByIssuer(asIssuer(9));
			assert.strictEqual(found.id, first.id);
			assert.strictEqual(found.issuerName, "first");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByIssuerFrequency returns the matching subscription", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			yield* repo.create(make({ issuerId: asIssuer(5), frequency: "monthly" }));
			yield* repo.create(make({ issuerId: asIssuer(5), frequency: "yearly" }));
			const found = yield* repo.getByIssuerFrequency(asIssuer(5), "yearly");
			assert.strictEqual(found.frequency, "yearly");
			assert.strictEqual(found.issuerId, asIssuer(5));
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update merges the partial and keeps other fields", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			const created = yield* repo.create(
				make({ chargeCount: 3, status: "active" }),
			);
			const updated = yield* repo.update(created.id, {
				chargeCount: 4,
				status: "possibly-cancelled",
			});
			assert.strictEqual(updated.chargeCount, 4);
			assert.strictEqual(updated.status, "possibly-cancelled");
			assert.strictEqual(updated.issuerName, created.issuerName);
			assert.strictEqual(updated.id, created.id);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update can replace transactionIds", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			const created = yield* repo.create(make());
			const updated = yield* repo.update(created.id, {
				transactionIds: [asTransaction(99)],
			});
			assert.deepStrictEqual(updated.transactionIds, [asTransaction(99)]);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getFirstByIssuer fails NotFound when the issuer has none", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			const error = yield* repo
				.getFirstByIssuer(asIssuer(404))
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "subscription", id: asIssuer(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getByIssuerFrequency fails NotFound on no match", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			yield* repo.create(make({ issuerId: asIssuer(1), frequency: "monthly" }));
			const error = yield* repo
				.getByIssuerFrequency(asIssuer(1), "weekly")
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "subscription", id: "weekly" }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update fails NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			const error = yield* repo
				.update(asSubscription(404), { chargeCount: 9 })
				.pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "subscription", id: asSubscription(404) }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);
});
