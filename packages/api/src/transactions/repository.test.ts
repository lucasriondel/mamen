import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import {
	AccountId,
	AnomalyFlag,
	CategoryId,
	IssuerId,
	NotFound,
	Transaction,
	type TransactionCreate,
	TransactionId,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { TransactionFromRow, TransactionRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `TransactionRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = TransactionRepo.Default.pipe(Layer.provide(DatabaseTest));

const asAccount = Schema.decodeSync(AccountId);
const asCategory = Schema.decodeSync(CategoryId);
const asIssuer = Schema.decodeSync(IssuerId);
const asTx = Schema.decodeSync(TransactionId);

const DATE = new Date("2026-03-01T00:00:00.000Z");

/** A minimal valid create payload; override any field per test. */
const make = (over: Partial<TransactionCreate> = {}): TransactionCreate => ({
	accountId: asAccount(1),
	date: DATE,
	amount: 42.5,
	rawIssuerString: "ACME STORE",
	importedAt: DATE,
	importMonth: "2026-03",
	...over,
});

/** The default list args (unfiltered, first page, natural order). */
const listAll = {
	limit: 50,
	offset: 0,
	direction: "desc" as const,
};

describe("TransactionFromRow storage codec", () => {
	// The row codec's `encode` is the storage inverse of the read path. It's the
	// documented shape the DB holds, so verify decode∘encode = id for both a
	// fully-populated entity and a bare one — this pins the null/0-1/JSON folds in
	// both directions and keeps the inverse from silently drifting.
	const encode = Schema.encodeSync(TransactionFromRow);
	const decode = Schema.decodeSync(TransactionFromRow);

	it("round-trips a fully-populated transaction through encode/decode", () => {
		const full = new Transaction({
			id: asTx(1),
			accountId: asAccount(2),
			date: DATE,
			amount: 12.5,
			rawIssuerString: "ACME",
			issuerId: asIssuer(3),
			categoryId: asCategory(4),
			manualCategory: true,
			manualIssuer: true,
			isRefund: true,
			linkedRefundId: asTx(6),
			anomalyFlags: [
				new AnomalyFlag({
					type: "high-amount",
					reason: "big",
					detectedAt: "2026-03-01T00:00:00.000Z",
					dismissed: false,
				}),
			],
			isDuplicateExcluded: true,
			duplicateNote: "dup",
			importedAt: DATE,
			importMonth: "2026-03",
			importBatchId: "batch-9",
		});
		const row = encode(full);
		// The stored row carries every column non-null, booleans as 1, the flags as JSON.
		assert.strictEqual(row.manualCategory, 1);
		assert.strictEqual(row.manualIssuer, 1);
		assert.strictEqual(row.issuerId, 3);
		assert.strictEqual(typeof row.anomalyFlags, "string");
		assert.deepStrictEqual(decode(row), full);
	});

	it("round-trips a bare transaction (optional fields → null columns)", () => {
		const bare = new Transaction({
			id: asTx(1),
			accountId: asAccount(2),
			date: DATE,
			amount: 1,
			rawIssuerString: "X",
			importedAt: DATE,
			importMonth: "2026-03",
		});
		const row = encode(bare);
		assert.strictEqual(row.issuerId, null);
		assert.strictEqual(row.manualCategory, 0);
		assert.strictEqual(row.manualIssuer, 0);
		assert.strictEqual(row.anomalyFlags, null);
		assert.strictEqual(row.importBatchId, null);
		assert.deepStrictEqual(decode(row), bare);
	});
});

describe("TransactionRepo", () => {
	it.effect("the vestigial category columns are dropped from the table", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const columns = yield* sql<{
				name: string;
			}>`PRAGMA table_info(transactions)`;
			const names = columns.map((c) => c.name);
			assert.ok(!names.includes("subcategoryId"));
			assert.ok(!names.includes("categoryOverride"));
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("create assigns an id, then getById round-trips it", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const created = yield* repo.create(make({ amount: 99.99 }));
			assert.ok(created.id > 0);
			assert.strictEqual(created.amount, 99.99);
			assert.strictEqual(created.accountId, asAccount(1));

			const fetched = yield* repo.getById(created.id);
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect(
		"optional fields absent on create stay absent (null → undefined)",
		() =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const created = yield* repo.create(make());
				assert.strictEqual(created.issuerId, undefined);
				assert.strictEqual(created.categoryId, undefined);
				assert.strictEqual(created.manualIssuer, undefined);
				assert.strictEqual(created.isRefund, undefined);
				assert.strictEqual(created.anomalyFlags, undefined);
				assert.strictEqual(created.importBatchId, undefined);
			}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("optional fields set on create round-trip through storage", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const created = yield* repo.create(
				make({
					issuerId: asIssuer(7),
					categoryId: asCategory(3),
					manualCategory: true,
					manualIssuer: true,
					isRefund: true,
					linkedRefundId: asTx(1),
					isDuplicateExcluded: true,
					duplicateNote: "seen before",
					importBatchId: "batch-1",
				}),
			);
			assert.strictEqual(created.issuerId, asIssuer(7));
			assert.strictEqual(created.categoryId, asCategory(3));
			assert.strictEqual(created.manualCategory, true);
			assert.strictEqual(created.manualIssuer, true);
			assert.strictEqual(created.isRefund, true);
			assert.strictEqual(created.linkedRefundId, asTx(1));
			assert.strictEqual(created.isDuplicateExcluded, true);
			assert.strictEqual(created.duplicateNote, "seen before");
			assert.strictEqual(created.importBatchId, "batch-1");
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("anomalyFlags array round-trips through the JSON column", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const flags = [
				new AnomalyFlag({
					type: "high-amount",
					reason: "3x the usual",
					detectedAt: "2026-03-01T00:00:00.000Z",
					dismissed: false,
				}),
				new AnomalyFlag({
					type: "potential-duplicate",
					reason: "same day, same amount",
					detectedAt: "2026-03-01T00:00:00.000Z",
					dismissed: true,
					dismissedAt: "2026-03-02T00:00:00.000Z",
					linkedTransactionId: 55,
				}),
			];
			const created = yield* repo.create(make({ anomalyFlags: flags }));
			const fetched = yield* repo.getById(created.id);
			assert.deepStrictEqual(fetched.anomalyFlags, flags);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("update merges a partial change and keeps other fields", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const created = yield* repo.create(make({ amount: 10 }));
			const updated = yield* repo.update(created.id, {
				amount: 20,
				categoryId: asCategory(9),
			});
			assert.strictEqual(updated.amount, 20);
			assert.strictEqual(updated.categoryId, asCategory(9));
			assert.strictEqual(updated.rawIssuerString, "ACME STORE");
			assert.strictEqual(updated.id, created.id);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("remove deletes the row", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const created = yield* repo.create(make());
			yield* repo.remove(created.id);
			const error = yield* repo.getById(created.id).pipe(Effect.flip);
			assert.deepStrictEqual(
				error,
				new NotFound({ resource: "transaction", id: created.id }),
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	it.effect("getById / update / remove fail NotFound on a missing id", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const missing = asTx(404);
			const expected = new NotFound({ resource: "transaction", id: missing });

			assert.deepStrictEqual(
				yield* repo.getById(missing).pipe(Effect.flip),
				expected,
			);
			assert.deepStrictEqual(
				yield* repo.update(missing, { amount: 1 }).pipe(Effect.flip),
				expected,
			);
			assert.deepStrictEqual(
				yield* repo.remove(missing).pipe(Effect.flip),
				expected,
			);
		}).pipe(Effect.provide(RepoTest)),
	);

	describe("composable list/count filters", () => {
		// Seed a diverse set so every filter has both matching and non-matching
		// rows. Returns the created transactions in insertion order. The category
		// filter matches the DERIVED category (ADR 0002), so these `categoryId`
		// rows carry `manualCategory` (an override) to keep the stored id in force;
		// the issuer-derived filter path has its own dedicated handler tests.
		const seed = (repo: TransactionRepo) =>
			Effect.all([
				repo.create(
					make({
						accountId: asAccount(1),
						categoryId: asCategory(7),
						manualCategory: true,
						issuerId: asIssuer(2),
						date: new Date("2026-01-10T00:00:00.000Z"),
						importMonth: "2026-01",
						importBatchId: "batch-a",
						isRefund: true,
					}),
				),
				repo.create(
					make({
						accountId: asAccount(1),
						categoryId: asCategory(8),
						manualCategory: true,
						date: new Date("2026-02-10T00:00:00.000Z"),
						importMonth: "2026-02",
						importBatchId: "batch-b",
						isDuplicateExcluded: true,
					}),
				),
				repo.create(
					make({
						accountId: asAccount(2),
						categoryId: asCategory(7),
						manualCategory: true,
						date: new Date("2026-03-10T00:00:00.000Z"),
						importMonth: "2026-03",
						linkedRefundId: asTx(1),
					}),
				),
			]);

		it.effect("no filter returns every row", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);
				const page = yield* repo.list(listAll);
				assert.strictEqual(page.total, 3);
				assert.strictEqual(page.items.length, 3);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"accountId + categoryId + startDate combine (old fan-out could not)",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seed(repo);
					// account 1, category 7, on/after 2026-01-01 → only the first row.
					const page = yield* repo.list({
						...listAll,
						accountId: asAccount(1),
						categoryId: asCategory(7),
						startDate: new Date("2026-01-01T00:00:00.000Z"),
					});
					assert.strictEqual(page.total, 1);
					assert.strictEqual(page.items[0]?.importMonth, "2026-01");
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("importMonth alone works (was ignored without accountId)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);
				const page = yield* repo.list({ ...listAll, importMonth: "2026-02" });
				assert.strictEqual(page.total, 1);
				assert.strictEqual(page.items[0]?.importMonth, "2026-02");
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("startDate alone works (was ignored without endDate)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);
				// on/after 2026-02-01 → rows 2 and 3.
				const page = yield* repo.list({
					...listAll,
					startDate: new Date("2026-02-01T00:00:00.000Z"),
				});
				assert.strictEqual(page.total, 2);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("startDate + endDate bound the range inclusively", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);
				const page = yield* repo.list({
					...listAll,
					startDate: new Date("2026-02-10T00:00:00.000Z"),
					endDate: new Date("2026-02-10T00:00:00.000Z"),
				});
				assert.strictEqual(page.total, 1);
				assert.strictEqual(page.items[0]?.importMonth, "2026-02");
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("each single filter narrows correctly", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);

				const byIssuer = yield* repo.list({
					...listAll,
					issuerId: asIssuer(2),
				});
				assert.strictEqual(byIssuer.total, 1);

				const byLinked = yield* repo.list({
					...listAll,
					linkedRefundId: asTx(1),
				});
				assert.strictEqual(byLinked.total, 1);

				const byBatch = yield* repo.list({
					...listAll,
					importBatchId: "batch-a",
				});
				assert.strictEqual(byBatch.total, 1);

				const refunds = yield* repo.list({ ...listAll, isRefund: true });
				assert.strictEqual(refunds.total, 1);

				const excluded = yield* repo.list({
					...listAll,
					isDuplicateExcluded: true,
				});
				assert.strictEqual(excluded.total, 1);

				// The `false` arm of the boolean filter: only row 2 is excluded, so
				// `false` matches the other two.
				const notExcluded = yield* repo.list({
					...listAll,
					isDuplicateExcluded: false,
				});
				assert.strictEqual(notExcluded.total, 2);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("isRefund=false excludes the refund row", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);
				const page = yield* repo.list({ ...listAll, isRefund: false });
				// Only row 1 has isRefund=1; the other two are 0.
				assert.strictEqual(page.total, 2);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("orderBy date asc / desc orders the page", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);

				const asc = yield* repo.list({
					...listAll,
					orderBy: "date",
					direction: "asc",
				});
				assert.deepStrictEqual(
					asc.items.map((t) => t.importMonth),
					["2026-01", "2026-02", "2026-03"],
				);

				const desc = yield* repo.list({
					...listAll,
					orderBy: "date",
					direction: "desc",
				});
				assert.deepStrictEqual(
					desc.items.map((t) => t.importMonth),
					["2026-03", "2026-02", "2026-01"],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("limit/offset page while total stays the full filtered set", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);
				const page = yield* repo.list({
					...listAll,
					accountId: asAccount(1),
					limit: 1,
					offset: 1,
				});
				assert.strictEqual(page.total, 2); // account 1 has two rows
				assert.strictEqual(page.items.length, 1);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("count honors every filter list does", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seed(repo);

				assert.strictEqual((yield* repo.count({})).count, 3);
				assert.strictEqual(
					(yield* repo.count({ accountId: asAccount(1) })).count,
					2,
				);
				assert.strictEqual(
					(yield* repo.count({ importMonth: "2026-03" })).count,
					1,
				);
				assert.strictEqual(
					(yield* repo.count({
						accountId: asAccount(1),
						categoryId: asCategory(7),
						startDate: new Date("2026-01-01T00:00:00.000Z"),
					})).count,
					1,
				);
			}).pipe(Effect.provide(RepoTest)),
		);
	});
});
