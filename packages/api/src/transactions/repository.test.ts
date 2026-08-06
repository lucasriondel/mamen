import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import {
	AccountId,
	AnomalyFlag,
	BundleInvalid,
	CategoryId,
	IssuerId,
	NotFound,
	Transaction,
	type TransactionCreate,
	TransactionId,
	TransactionUpdate,
	TransferInvalid,
} from "@mamen/shared/contract";
import { Effect, Either, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { TransactionFromRow, TransactionRepo } from "./repository";

// The repository over a fresh `:memory:` DB. `TransactionRepo.Default` needs a
// SqlClient, provided by `DatabaseTest`; built per test for isolation.
const RepoTest = TransactionRepo.Default.pipe(Layer.provide(DatabaseTest));

// Like `RepoTest`, but keeps the underlying `SqlClient` in the output context so
// a test can seed raw rows (e.g. an `issuers` row for the join-backed search).
const RepoAndSqlTest = TransactionRepo.Default.pipe(
	Layer.provideMerge(DatabaseTest),
);

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
			transferGroupId: asTx(1),
			// Stated explicitly: `kind` is the one column storage always holds, so an
			// entity that leaves it absent does not survive the round-trip unchanged
			// — it comes back as the `bank` row it always was (see the bare case).
			kind: "bank",
			bundleId: asTx(8),
			manualDate: true,
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
			notes: "lunch with the team",
			importedAt: DATE,
			importMonth: "2026-03",
			importBatchId: "batch-9",
		});
		const row = encode(full);
		// The stored row carries every column non-null, booleans as 1, the flags as JSON.
		assert.strictEqual(row.manualCategory, 1);
		assert.strictEqual(row.manualIssuer, 1);
		assert.strictEqual(row.issuerId, 3);
		assert.strictEqual(row.notes, "lunch with the team");
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
		assert.strictEqual(row.transferGroupId, null);
		assert.strictEqual(row.bundleId, null);
		assert.strictEqual(row.manualDate, 0);
		assert.strictEqual(row.manualCategory, 0);
		assert.strictEqual(row.manualIssuer, 0);
		assert.strictEqual(row.anomalyFlags, null);
		assert.strictEqual(row.notes, null);
		assert.strictEqual(row.importBatchId, null);
		// `kind` is the exception to the null → absent fold: the column is never
		// null, so an absent kind is stored as the `bank` it means and reads back
		// that way. Every other absent field round-trips as absent.
		assert.strictEqual(row.kind, "bank");
		assert.deepStrictEqual(
			decode(row),
			new Transaction({ ...bare, kind: "bank" }),
		);
	});
});

describe("Transaction notes cap (issue #38)", () => {
	// The `notes` cap is the one constrained string on the entity: 1000 chars,
	// enforced at the contract boundary so an over-long note fails decode (400)
	// rather than reaching the DB. `TransactionUpdate` (a partial of the create)
	// is the payload the notes editor sends; decode it with only `notes` set.
	const decode = Schema.decodeEither(TransactionUpdate);

	it("accepts a note at the 1000-char limit", () => {
		assert.ok(Either.isRight(decode({ notes: "n".repeat(1000) })));
	});

	it("rejects a note over 1000 chars", () => {
		assert.ok(Either.isLeft(decode({ notes: "n".repeat(1001) })));
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
				assert.strictEqual(created.transferGroupId, undefined);
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
					transferGroupId: asTx(2),
					isDuplicateExcluded: true,
					duplicateNote: "seen before",
					notes: "reimbursable",
					importBatchId: "batch-1",
				}),
			);
			assert.strictEqual(created.issuerId, asIssuer(7));
			assert.strictEqual(created.categoryId, asCategory(3));
			assert.strictEqual(created.manualCategory, true);
			assert.strictEqual(created.manualIssuer, true);
			assert.strictEqual(created.isRefund, true);
			assert.strictEqual(created.linkedRefundId, asTx(1));
			assert.strictEqual(created.transferGroupId, asTx(2));
			assert.strictEqual(created.isDuplicateExcluded, true);
			assert.strictEqual(created.duplicateNote, "seen before");
			assert.strictEqual(created.notes, "reimbursable");
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

	// Notes are set through the same partial `update` as any field (issue #38),
	// and — because the write re-writes the whole row from the stored merge base —
	// a later update to a *different* field must not silently drop the note.
	it.effect("update sets notes, and a later unrelated update keeps them", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const created = yield* repo.create(make());
			assert.strictEqual(created.notes, undefined);

			const noted = yield* repo.update(created.id, { notes: "call the bank" });
			assert.strictEqual(noted.notes, "call the bank");

			const reamounted = yield* repo.update(created.id, { amount: 42 });
			assert.strictEqual(reamounted.amount, 42);
			assert.strictEqual(reamounted.notes, "call the bank");
		}).pipe(Effect.provide(RepoTest)),
	);

	// The foundation for Internal transfers (PRD #48, issue #49): the flat
	// `transferGroupId` is set through the generic update path (no link/unlink
	// endpoint yet), so it must persist and read back on `getById` — the
	// end-to-end round-trip the later link/recap slices build on. A later
	// unrelated update must not silently drop it (whole-row re-write from the
	// stored merge base), exactly like `notes`.
	it.effect("update sets transferGroupId, and it round-trips on getById", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const created = yield* repo.create(make());
			assert.strictEqual(created.transferGroupId, undefined);

			const grouped = yield* repo.update(created.id, {
				transferGroupId: created.id,
			});
			assert.strictEqual(grouped.transferGroupId, created.id);

			const fetched = yield* repo.getById(created.id);
			assert.strictEqual(fetched.transferGroupId, created.id);

			const reamounted = yield* repo.update(created.id, { amount: 7 });
			assert.strictEqual(reamounted.amount, 7);
			assert.strictEqual(reamounted.transferGroupId, created.id);
		}).pipe(Effect.provide(RepoTest)),
	);

	// Recap exclusion (issue #67, ADR 0008): the two stored flags land through the
	// same generic paths every other field uses — create, then a partial update —
	// and, like `notes`/`transferGroupId`, must survive a later unrelated write
	// (the whole-row re-write from the stored merge base).
	it.effect(
		"excludedFromRecap + manualExcluded round-trip through create",
		() =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const created = yield* repo.create(
					make({ excludedFromRecap: true, manualExcluded: true }),
				);
				assert.strictEqual(created.excludedFromRecap, true);
				assert.strictEqual(created.manualExcluded, true);

				const fetched = yield* repo.getById(created.id);
				assert.strictEqual(fetched.excludedFromRecap, true);
				assert.strictEqual(fetched.manualExcluded, true);
			}).pipe(Effect.provide(RepoTest)),
	);

	it.effect(
		"a row defaults to not-excluded, and update flips it both ways",
		() =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const created = yield* repo.create(make());
				// Both columns default to not-excluded, so an untouched row is absent on
				// the wire exactly like the other 0/1 flags.
				assert.strictEqual(created.excludedFromRecap, undefined);
				assert.strictEqual(created.manualExcluded, undefined);

				const excluded = yield* repo.update(created.id, {
					excludedFromRecap: true,
					manualExcluded: true,
				});
				assert.strictEqual(excluded.excludedFromRecap, true);
				assert.strictEqual(excluded.manualExcluded, true);

				// An unrelated later edit must not silently drop the exclusion.
				const reamounted = yield* repo.update(created.id, { amount: 7 });
				assert.strictEqual(reamounted.amount, 7);
				assert.strictEqual(reamounted.excludedFromRecap, true);

				// Re-including is the same lever in the other direction — and it stays a
				// deliberate decision, so `manualExcluded` remains set (ADR 0008).
				const included = yield* repo.update(created.id, {
					excludedFromRecap: false,
					manualExcluded: true,
				});
				assert.strictEqual(included.excludedFromRecap, undefined);
				assert.strictEqual(included.manualExcluded, true);
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
						transferGroupId: asTx(2),
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

				const byTransferGroup = yield* repo.list({
					...listAll,
					transferGroupId: asTx(2),
				});
				assert.strictEqual(byTransferGroup.total, 1);

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

		it.effect(
			"accountId accepts a set (the recap's selection, issue #86)",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seed(repo);
					// Both accounts, as one filter — what a recap detail page carries over
					// from a multi-select account picker.
					const both = yield* repo.list({
						...listAll,
						accountId: [asAccount(1), asAccount(2)],
					});
					assert.strictEqual(both.total, 3);
					const one = yield* repo.list({
						...listAll,
						accountId: [asAccount(2)],
					});
					assert.strictEqual(one.total, 1);
				}).pipe(Effect.provide(RepoTest)),
		);

		// The **Unassigned** buckets the recap reports, made reachable (issue #86).
		// `"none"` is its own value, not the absent filter: absent means "any".
		describe("unassigned filters (issue #86)", () => {
			it.effect("issuerId=none returns only the rows with no issuer", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seed(repo);
					// Only row 1 carries an issuer, so the other two are unassigned.
					const page = yield* repo.list({ ...listAll, issuerId: "none" });
					assert.strictEqual(page.total, 2);
					assert.ok(page.items.every((t) => t.issuerId == null));

					const count = yield* repo.count({ issuerId: "none" });
					assert.strictEqual(count.count, 2);
				}).pipe(Effect.provide(RepoTest)),
			);

			it.effect(
				"categoryId=none reads the DERIVED category, so an issuer-categorised row is not unassigned",
				() =>
					Effect.gen(function* () {
						const repo = yield* TransactionRepo;
						const sql = yield* SqlClient.SqlClient;
						// Issuer 8 defaults to category 7; issuer 9 has no default.
						yield* sql`INSERT INTO issuers (id, name, defaultCategoryId, createdAt, firstSeen) VALUES (8, 'Spotify AB', 7, ${DATE.toISOString()}, ${DATE.toISOString()})`;
						yield* sql`INSERT INTO issuers (id, name, createdAt, firstSeen) VALUES (9, 'Uncategorised Co', ${DATE.toISOString()}, ${DATE.toISOString()})`;
						// Categorised through its issuer — NOT unassigned, even though its
						// own `categoryId` column is null.
						yield* repo.create(make({ issuerId: asIssuer(8) }));
						// An issuer with no default → no derived category at all.
						yield* repo.create(make({ issuerId: asIssuer(9) }));
						// No issuer and no stored category → unassigned.
						yield* repo.create(make({}));
						// A hand-overridden row → its own stored id stands.
						yield* repo.create(
							make({ categoryId: asCategory(4), manualCategory: true }),
						);

						const page = yield* repo.list({ ...listAll, categoryId: "none" });
						assert.strictEqual(page.total, 2);

						const count = yield* repo.count({ categoryId: "none" });
						assert.strictEqual(count.count, 2);
					}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("the unassigned filters AND-compose with a period", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seed(repo);
					// Rows 2 and 3 have no issuer; only row 3 falls in March.
					const page = yield* repo.list({
						...listAll,
						issuerId: "none",
						startDate: new Date("2026-03-01T00:00:00.000Z"),
						endDate: new Date("2026-03-31T23:59:59.999Z"),
					});
					assert.strictEqual(page.total, 1);
					assert.strictEqual(page.items[0]?.importMonth, "2026-03");
				}).pipe(Effect.provide(RepoTest)),
			);
		});

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

		describe("free-text search (issue #40)", () => {
			// A dedicated seed: distinct raw-issuer strings, notes, and amounts so a
			// term can hit exactly one field at a time. Row 3 also links a real
			// `issuers` row so the join-backed `i.name` match is exercised.
			const seedSearch = (repo: TransactionRepo) =>
				Effect.gen(function* () {
					const sql = yield* SqlClient.SqlClient;
					yield* sql`INSERT INTO issuers (id, name, createdAt, firstSeen) VALUES (9, 'Spotify AB', ${DATE.toISOString()}, ${DATE.toISOString()})`;
					yield* repo.create(
						make({
							rawIssuerString: "CARREFOUR MARKET",
							amount: 42.5,
							notes: "weekly groceries",
						}),
					);
					yield* repo.create(
						make({
							rawIssuerString: "EDF ENERGY",
							// A debit, stored signed — the search matches its unsigned figure.
							amount: -6.99,
						}),
					);
					yield* repo.create(
						make({
							rawIssuerString: "SPOT-9021",
							issuerId: asIssuer(9),
							amount: 9.99,
							notes: "music",
						}),
					);
				});

			it.effect("matches the raw issuer string, case-insensitively", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					const page = yield* repo.list({ ...listAll, search: "carrefour" });
					assert.strictEqual(page.total, 1);
					assert.strictEqual(
						page.items[0]?.rawIssuerString,
						"CARREFOUR MARKET",
					);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("matches the joined issuer name", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					// "spotify" is only on the joined issuer, not the raw string.
					const page = yield* repo.list({ ...listAll, search: "spotify" });
					assert.strictEqual(page.total, 1);
					assert.strictEqual(page.items[0]?.rawIssuerString, "SPOT-9021");
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("matches the notes text", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					const page = yield* repo.list({ ...listAll, search: "groceries" });
					assert.strictEqual(page.total, 1);
					assert.strictEqual(
						page.items[0]?.rawIssuerString,
						"CARREFOUR MARKET",
					);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("matches the amount, ignoring the debit sign", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					// EDF is stored as -6.99; the user types the bare figure they see.
					const page = yield* repo.list({ ...listAll, search: "6.99" });
					assert.strictEqual(page.total, 1);
					assert.strictEqual(page.items[0]?.rawIssuerString, "EDF ENERGY");
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("matches the amount at the displayed 2-decimal precision", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					// CARREFOUR is stored as 42.5 but displayed as 42.50 (fr-FR, 2dp).
					const page = yield* repo.list({ ...listAll, search: "42.50" });
					assert.strictEqual(page.total, 1);
					assert.strictEqual(
						page.items[0]?.rawIssuerString,
						"CARREFOUR MARKET",
					);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("accepts the fr-FR decimal comma in an amount search", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					const page = yield* repo.list({ ...listAll, search: "42,50" });
					assert.strictEqual(page.total, 1);
					assert.strictEqual(
						page.items[0]?.rawIssuerString,
						"CARREFOUR MARKET",
					);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("combines with other filters (AND)", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					// "e" hits every raw string, but account 2 has none of these rows.
					const page = yield* repo.list({
						...listAll,
						search: "e",
						accountId: asAccount(2),
					});
					assert.strictEqual(page.total, 0);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("a blank/whitespace term is a no-op (returns all)", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					const page = yield* repo.list({ ...listAll, search: "   " });
					assert.strictEqual(page.total, 3);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("treats LIKE metachars as literal text", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					// "%" would match everything if unescaped; none of the rows contain
					// a literal percent sign, so the escaped search matches nothing.
					const page = yield* repo.list({ ...listAll, search: "%" });
					assert.strictEqual(page.total, 0);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("count honors the search filter", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedSearch(repo);
					assert.strictEqual(
						(yield* repo.count({ search: "spotify" })).count,
						1,
					);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);
		});

		// The `uncurated` filter — rows nothing has been reviewed on. Every case
		// below pins one of the three curation signals (issuer, DERIVED category,
		// note) as enough to exclude a row.
		describe("uncurated filter", () => {
			// Four rows, one per curation state: bare, issuer-only, note-only, and
			// one categorised *through its issuer* rather than by hand — the case a
			// stored-column check would wrongly report as uncurated. Issuer 8 carries
			// a `defaultCategoryId`; issuer 9 has none.
			const seedCuration = (repo: TransactionRepo) =>
				Effect.gen(function* () {
					const sql = yield* SqlClient.SqlClient;
					yield* sql`INSERT INTO issuers (id, name, defaultCategoryId, createdAt, firstSeen) VALUES (8, 'Spotify AB', 7, ${DATE.toISOString()}, ${DATE.toISOString()})`;
					yield* sql`INSERT INTO issuers (id, name, createdAt, firstSeen) VALUES (9, 'Uncategorised Co', ${DATE.toISOString()}, ${DATE.toISOString()})`;
					yield* repo.create(make({ rawIssuerString: "BARE ROW" }));
					yield* repo.create(
						make({ rawIssuerString: "ISSUER ONLY", issuerId: asIssuer(9) }),
					);
					yield* repo.create(
						make({ rawIssuerString: "NOTE ONLY", notes: "check this" }),
					);
					yield* repo.create(
						make({ rawIssuerString: "DERIVED CAT", issuerId: asIssuer(8) }),
					);
				});

			it.effect("returns only the row with no issuer, category or note", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedCuration(repo);
					const page = yield* repo.list({ ...listAll, uncurated: true });
					assert.strictEqual(page.total, 1);
					assert.strictEqual(page.items[0]?.rawIssuerString, "BARE ROW");
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("counts an issuer-derived category as curated", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedCuration(repo);
					// DERIVED CAT stores no `categoryId` of its own — it inherits one
					// from issuer 8. Filtering on the stored column would return it.
					const page = yield* repo.list({ ...listAll, uncurated: true });
					assert.deepStrictEqual(
						page.items.map((t) => t.rawIssuerString),
						["BARE ROW"],
					);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("treats a whitespace-only note as no note", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(
						make({ rawIssuerString: "BLANK NOTE", notes: "  " }),
					);
					const page = yield* repo.list({ ...listAll, uncurated: true });
					assert.strictEqual(page.total, 1);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("false returns the complement, absent returns both", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedCuration(repo);
					assert.strictEqual(
						(yield* repo.list({ ...listAll, uncurated: false })).total,
						3,
					);
					assert.strictEqual((yield* repo.list(listAll)).total, 4);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("combines with other filters (AND)", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedCuration(repo);
					// The one uncurated row is on account 1, so account 2 has none.
					const page = yield* repo.list({
						...listAll,
						uncurated: true,
						accountId: asAccount(2),
					});
					assert.strictEqual(page.total, 0);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			it.effect("count honors the uncurated filter", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedCuration(repo);
					assert.strictEqual((yield* repo.count({ uncurated: true })).count, 1);
				}).pipe(Effect.provide(RepoAndSqlTest)),
			);

			// Issue #70: an **excluded from recap** row is exempt from the curation
			// question entirely. Curating it changes no number, so it is not a to-do
			// — and it is not "done" either, so neither polarity of the filter lists
			// it. Both routes into exclusion (the per-row flag and the issuer's
			// default) are read through the SAME fragment the projection uses, so a
			// stored-column check would drop the inherited half (ADR 0002/0008).
			describe("excluded rows are exempt", () => {
				it.effect("a manually excluded bare row is not uncurated", () =>
					Effect.gen(function* () {
						const repo = yield* TransactionRepo;
						yield* repo.create(
							make({
								rawIssuerString: "EXCLUDED BARE",
								excludedFromRecap: true,
								manualExcluded: true,
							}),
						);
						yield* repo.create(make({ rawIssuerString: "COUNTED BARE" }));

						const page = yield* repo.list({ ...listAll, uncurated: true });
						assert.deepStrictEqual(
							page.items.map((t) => t.rawIssuerString),
							["COUNTED BARE"],
						);
					}).pipe(Effect.provide(RepoTest)),
				);

				// Exemption, not reclassification: a row nobody has curated is not
				// suddenly "curated" because it is excluded, so the complement must
				// not pick it up on the way out of the uncurated view.
				it.effect("…and it is not in the complement either", () =>
					Effect.gen(function* () {
						const repo = yield* TransactionRepo;
						yield* repo.create(
							make({
								rawIssuerString: "EXCLUDED BARE",
								excludedFromRecap: true,
								manualExcluded: true,
							}),
						);

						assert.strictEqual(
							(yield* repo.list({ ...listAll, uncurated: false })).total,
							0,
						);
						// Absent, the filter says nothing about exclusion: the row is
						// hidden from a *curation* view, never from the table.
						assert.strictEqual((yield* repo.list(listAll)).total, 1);
					}).pipe(Effect.provide(RepoTest)),
				);

				// The route a stored-column check would miss (ADR 0008). The row has
				// an issuer, so it was never uncurated — it is the *complement* it has
				// to drop out of, through the derivation rather than its own column,
				// which reads 0 here.
				it.effect("a row excluded through its issuer is exempt too", () =>
					Effect.gen(function* () {
						const sql = yield* SqlClient.SqlClient;
						const repo = yield* TransactionRepo;
						yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (10, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
						yield* repo.create(
							make({ rawIssuerString: "INHERITED", issuerId: asIssuer(10) }),
						);

						assert.strictEqual(
							(yield* repo.list({ ...listAll, uncurated: true })).total,
							0,
						);
						assert.strictEqual(
							(yield* repo.list({ ...listAll, uncurated: false })).total,
							0,
						);
					}).pipe(Effect.provide(RepoAndSqlTest)),
				);

				// The override in the other direction: pulled back into the recap, the
				// row is spending again and rejoins the curation question — proof the
				// exemption follows the derived value, not either column alone.
				it.effect("a row forced back into the recap is curated again", () =>
					Effect.gen(function* () {
						const sql = yield* SqlClient.SqlClient;
						const repo = yield* TransactionRepo;
						yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (10, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
						yield* repo.create(
							make({
								rawIssuerString: "PULLED BACK IN",
								issuerId: asIssuer(10),
								excludedFromRecap: false,
								manualExcluded: true,
							}),
						);

						assert.strictEqual(
							(yield* repo.list({ ...listAll, uncurated: false })).total,
							1,
						);
					}).pipe(Effect.provide(RepoAndSqlTest)),
				);

				it.effect("count honors the exemption", () =>
					Effect.gen(function* () {
						const repo = yield* TransactionRepo;
						yield* seedCuration(repo);
						yield* repo.create(
							make({
								rawIssuerString: "EXCLUDED BARE",
								excludedFromRecap: true,
								manualExcluded: true,
							}),
						);

						// Still the one BARE ROW from `seedCuration`, not two.
						assert.strictEqual(
							(yield* repo.count({ uncurated: true })).count,
							1,
						);
					}).pipe(Effect.provide(RepoAndSqlTest)),
				);
			});
		});

		// The `excludedFromRecap` filter (issue #67) — the list must be able to
		// isolate the rows held out of spend totals, and their complement. The
		// filter reads the SAME expression the projection does (ADR 0008), so the
		// two cannot disagree; #69 widens both to the issuer-derived `CASE` at once.
		describe("excludedFromRecap filter", () => {
			const seedExclusion = (repo: TransactionRepo) =>
				Effect.all([
					repo.create(
						make({
							rawIssuerString: "EXCLUDED ROW",
							excludedFromRecap: true,
							manualExcluded: true,
						}),
					),
					repo.create(make({ rawIssuerString: "COUNTED ROW" })),
					repo.create(
						make({ rawIssuerString: "OTHER ACCOUNT", accountId: asAccount(2) }),
					),
				]);

			it.effect("true returns only the excluded rows", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedExclusion(repo);
					const page = yield* repo.list({
						...listAll,
						excludedFromRecap: true,
					});
					assert.deepStrictEqual(
						page.items.map((t) => t.rawIssuerString),
						["EXCLUDED ROW"],
					);
					assert.strictEqual(page.total, 1);
				}).pipe(Effect.provide(RepoTest)),
			);

			it.effect("false returns the complement, absent returns both", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedExclusion(repo);
					assert.strictEqual(
						(yield* repo.list({ ...listAll, excludedFromRecap: false })).total,
						2,
					);
					assert.strictEqual((yield* repo.list(listAll)).total, 3);
				}).pipe(Effect.provide(RepoTest)),
			);

			it.effect("combines with other filters (AND)", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedExclusion(repo);
					// The one excluded row is on account 1, so account 2 has none.
					const page = yield* repo.list({
						...listAll,
						excludedFromRecap: true,
						accountId: asAccount(2),
					});
					assert.strictEqual(page.total, 0);
				}).pipe(Effect.provide(RepoTest)),
			);

			it.effect("count honors the excludedFromRecap filter", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedExclusion(repo);
					assert.strictEqual(
						(yield* repo.count({ excludedFromRecap: true })).count,
						1,
					);
				}).pipe(Effect.provide(RepoTest)),
			);

			// The filter means the recap's `isRecapExcluded` — the derived flag OR
			// `isDuplicateExcluded` — because the recap's *Excluded from recap* line
			// sums exactly that and now links into this filter. Matching the flag
			// alone opened the line onto fewer rows than it had just counted.
			it.effect("true also returns duplicate-excluded rows", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(
						make({
							rawIssuerString: "EXCLUDED ROW",
							excludedFromRecap: true,
							manualExcluded: true,
						}),
					);
					yield* repo.create(
						make({
							rawIssuerString: "DUPLICATE ROW",
							isDuplicateExcluded: true,
						}),
					);
					yield* repo.create(make({ rawIssuerString: "COUNTED ROW" }));

					const page = yield* repo.list({
						...listAll,
						excludedFromRecap: true,
					});
					assert.deepStrictEqual(
						page.items.map((t) => t.rawIssuerString).sort(),
						["DUPLICATE ROW", "EXCLUDED ROW"],
					);
				}).pipe(Effect.provide(RepoTest)),
			);

			// The mirror, and the deliberate behaviour change: "counted" is now the
			// complement of the union, so a duplicate-excluded row is not in it —
			// which is what `countsTowardRecap` has always meant by counting.
			it.effect("false excludes duplicate-excluded rows too", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(
						make({
							rawIssuerString: "DUPLICATE ROW",
							isDuplicateExcluded: true,
						}),
					);
					yield* repo.create(make({ rawIssuerString: "COUNTED ROW" }));

					const page = yield* repo.list({
						...listAll,
						excludedFromRecap: false,
					});
					assert.deepStrictEqual(
						page.items.map((t) => t.rawIssuerString),
						["COUNTED ROW"],
					);
				}).pipe(Effect.provide(RepoTest)),
			);
		});

		// The `isTransferLeg` filter — the bulk form of `transferGroupId`, so the
		// recap's *Internal transfers* line can open the rows it summed. Built from
		// the same fragment `countsTowardRecap` nets those rows out with, so what
		// the recap removes and what this lists stay one set.
		describe("isTransferLeg filter", () => {
			const seedLegs = (repo: TransactionRepo) =>
				Effect.gen(function* () {
					const debit = yield* repo.create(
						make({ rawIssuerString: "LEG OUT", amount: -30 }),
					);
					const credit = yield* repo.create(
						make({
							rawIssuerString: "LEG IN",
							amount: 30,
							accountId: asAccount(2),
						}),
					);
					yield* repo.linkTransfer([debit.id, credit.id]);
					yield* repo.create(make({ rawIssuerString: "ORDINARY ROW" }));
				});

			it.effect("true returns only the legs, of every group", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedLegs(repo);
					const page = yield* repo.list({ ...listAll, isTransferLeg: true });
					assert.deepStrictEqual(
						page.items.map((t) => t.rawIssuerString).sort(),
						["LEG IN", "LEG OUT"],
					);
					assert.strictEqual(page.total, 2);
				}).pipe(Effect.provide(RepoTest)),
			);

			it.effect("false returns the complement, absent returns both", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedLegs(repo);
					const page = yield* repo.list({ ...listAll, isTransferLeg: false });
					assert.deepStrictEqual(
						page.items.map((t) => t.rawIssuerString),
						["ORDINARY ROW"],
					);
					assert.strictEqual((yield* repo.list(listAll)).total, 3);
				}).pipe(Effect.provide(RepoTest)),
			);

			// The combination the recap's transfers link actually writes: the line
			// reports `isTransferLeg AND NOT isRecapExcluded`, so an excluded leg is
			// counted on the *excluded* line instead and must not appear here.
			it.effect("AND-combines with excludedFromRecap, as the recap does", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedLegs(repo);
					const debit = yield* repo.create(
						make({
							rawIssuerString: "EXCLUDED LEG OUT",
							amount: -40,
							excludedFromRecap: true,
							manualExcluded: true,
						}),
					);
					const credit = yield* repo.create(
						make({
							rawIssuerString: "EXCLUDED LEG IN",
							amount: 40,
							accountId: asAccount(2),
						}),
					);
					yield* repo.linkTransfer([debit.id, credit.id]);

					const page = yield* repo.list({
						...listAll,
						isTransferLeg: true,
						excludedFromRecap: false,
					});
					assert.deepStrictEqual(
						page.items.map((t) => t.rawIssuerString).sort(),
						["EXCLUDED LEG IN", "LEG IN", "LEG OUT"],
					);
				}).pipe(Effect.provide(RepoTest)),
			);

			it.effect("count honors the isTransferLeg filter", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* seedLegs(repo);
					assert.strictEqual(
						(yield* repo.count({ isTransferLeg: true })).count,
						2,
					);
				}).pipe(Effect.provide(RepoTest)),
			);
		});

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

	// The **month filter** buckets a row by its OWN date (issue #87, epic #85),
	// not by the `importMonth` it was stamped with when it was parsed. The two
	// diverge whenever a row's date moves after import — a **bundle parent** dated
	// by hand into another month, a date corrected across a month boundary — and
	// the row then showed under a month its own date contradicted while being
	// absent from the month it belonged to. The recap stopped bucketing by the
	// stamp at issue #71; this is the same correction on the list.
	//
	// The parameter keeps its name (`importMonth`) so bookmarked URLs keep
	// working, and the column keeps being written — as provenance, which is all it
	// ever meant.
	describe("the month filter buckets by the row's own date (issue #87)", () => {
		it.effect(
			"returns the rows dated in the month, not those stamped with it",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					// The reported case (epic #85): a statement running from day 5 of one
					// month to day 6 of the next carries rows dated outside the month it
					// was filed under.
					const spillover = yield* repo.create(
						make({
							date: new Date("2026-04-02T00:00:00.000Z"),
							importMonth: "2026-03",
						}),
					);
					const march = yield* repo.create(
						make({
							date: new Date("2026-03-20T00:00:00.000Z"),
							importMonth: "2026-03",
						}),
					);

					const april = yield* repo.list({
						...listAll,
						importMonth: "2026-04",
					});
					assert.deepStrictEqual(
						april.items.map((t) => t.id),
						[spillover.id],
					);

					const marchPage = yield* repo.list({
						...listAll,
						importMonth: "2026-03",
					});
					assert.deepStrictEqual(
						marchPage.items.map((t) => t.id),
						[march.id],
					);

					// `count` runs the same WHERE, so the number under the table and the
					// rows in it cannot disagree (ADR 0002).
					assert.strictEqual(
						(yield* repo.count({ importMonth: "2026-04" })).count,
						1,
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("bounds the month at its first and last instant", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const first = yield* repo.create(
					make({ date: new Date("2026-03-01T00:00:00.000Z") }),
				);
				const last = yield* repo.create(
					make({ date: new Date("2026-03-31T23:59:59.999Z") }),
				);
				// The instants either side, which must fall out.
				yield* repo.create(
					make({ date: new Date("2026-02-28T23:59:59.999Z") }),
				);
				yield* repo.create(
					make({ date: new Date("2026-04-01T00:00:00.000Z") }),
				);

				const page = yield* repo.list({ ...listAll, importMonth: "2026-03" });
				assert.deepStrictEqual(
					page.items.map((t) => t.id),
					[first.id, last.id],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"follows a bundle parent's overridden date into another month",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(
						make({
							amount: -200,
							date: new Date("2026-03-07T00:00:00.000Z"),
							importMonth: "2026-03",
						}),
					);
					const b = yield* repo.create(
						make({
							amount: 150,
							date: new Date("2026-03-12T00:00:00.000Z"),
							importMonth: "2026-03",
						}),
					);
					const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
					yield* repo.update(parent.id, {
						date: new Date("2026-02-14T00:00:00.000Z"),
						manualDate: true,
					});

					// The stamp still names the statement that produced the members (#72):
					// the override says when the cost belongs, not which statement it came
					// from. So the two fields genuinely disagree here.
					assert.strictEqual(
						(yield* repo.getById(parent.id)).importMonth,
						"2026-03",
					);

					const february = yield* repo.list({
						...listAll,
						importMonth: "2026-02",
					});
					assert.deepStrictEqual(
						february.items.map((t) => t.id),
						[parent.id],
					);
					// And March no longer shows it: the members stay hidden behind their
					// parent, so the month it was stamped with lists nothing at all.
					assert.strictEqual(
						(yield* repo.list({ ...listAll, importMonth: "2026-03" })).total,
						0,
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("a key that is not a YYYY-MM month matches nothing", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(make());

				for (const key of ["2026", "2026-13", "2026-00", "not-a-month"]) {
					assert.strictEqual(
						(yield* repo.list({ ...listAll, importMonth: key })).total,
						0,
						key,
					);
				}
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// The **recap** (issue #71): spend aggregated in SQL over the WHOLE filtered
	// set — the thing the old client-side scan could only approximate past its row
	// cap. Every case below pins one clause of the single `countsTowardRecap`
	// predicate, or one edge of the period bound it runs under.
	describe("recap aggregation", () => {
		/** A spending row (a debit) dated in July 2026 unless told otherwise. */
		const spent = (over: Partial<TransactionCreate> = {}): TransactionCreate =>
			make({
				amount: -10,
				date: new Date("2026-07-15T12:00:00.000Z"),
				importMonth: "2026-07",
				...over,
			});

		/** The buckets as `{ [id]: spent }`, with `"none"` for the null bucket. */
		const byId = (
			rows: ReadonlyArray<{ id: number | null; spent: number; count: number }>,
		) => Object.fromEntries(rows.map((r) => [r.id ?? "none", r]));

		it.effect(
			"sums spend by issuer and by category, as positive magnitudes",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(
						spent({
							amount: -10,
							issuerId: asIssuer(1),
							categoryId: asCategory(7),
							manualCategory: true,
						}),
					);
					yield* repo.create(
						spent({
							amount: -5,
							issuerId: asIssuer(1),
							categoryId: asCategory(7),
							manualCategory: true,
						}),
					);
					yield* repo.create(
						spent({
							amount: -8,
							issuerId: asIssuer(2),
							categoryId: asCategory(8),
							manualCategory: true,
						}),
					);

					const recap = yield* repo.recap({});
					assert.deepStrictEqual(byId(recap.byIssuer)[1], {
						id: 1,
						spent: 15,
						count: 2,
					});
					assert.deepStrictEqual(byId(recap.byIssuer)[2], {
						id: 2,
						spent: 8,
						count: 1,
					});
					assert.deepStrictEqual(byId(recap.byCategory)[7], {
						id: 7,
						spent: 15,
						count: 2,
					});
				}).pipe(Effect.provide(RepoTest)),
		);

		// Spend is money OUT. Income and zero-value rows are not spending, so they
		// reach no bucket — a refund still nets its purchase out by being income.
		it.effect("counts only debits — income and zero rows reach no bucket", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(spent({ amount: -10, issuerId: asIssuer(1) }));
				yield* repo.create(spent({ amount: 100, issuerId: asIssuer(1) }));
				yield* repo.create(spent({ amount: 0, issuerId: asIssuer(1) }));

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(byId(recap.byIssuer)[1], {
					id: 1,
					spent: 10,
					count: 1,
				});
			}).pipe(Effect.provide(RepoTest)),
		);

		// Unattributed spend is still spend: it lands in a `null`-keyed bucket the
		// page labels *Unassigned*, rather than being dropped from the total.
		it.effect("reports rows with no issuer / no category under a null id", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(spent({ amount: -10 }));
				yield* repo.create(spent({ amount: -4 }));

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(byId(recap.byIssuer).none, {
					id: null,
					spent: 14,
					count: 2,
				});
				assert.deepStrictEqual(byId(recap.byCategory).none, {
					id: null,
					spent: 14,
					count: 2,
				});
			}).pipe(Effect.provide(RepoTest)),
		);

		// ADR 0002 on the aggregation surface: a row categorised THROUGH its issuer
		// must bucket under that category, not under Unassigned.
		it.effect("buckets by the derived category, not the stored column", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, defaultCategoryId, createdAt, firstSeen) VALUES (8, 'Spotify AB', 7, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				yield* repo.create(spent({ amount: -12, issuerId: asIssuer(8) }));

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(byId(recap.byCategory)[7], {
					id: 7,
					spent: 12,
					count: 1,
				});
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);

		// Transfer legs are money moving between the user's own accounts, so they
		// leave both breakdowns — and are summarised instead: the debit legs'
		// magnitudes, so a clean pair reads as what moved, not as double or ~zero.
		it.effect(
			"nets transfer legs out of the breakdowns and summarises them",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const debit = yield* repo.create(
						spent({ amount: -30, issuerId: asIssuer(1) }),
					);
					const credit = yield* repo.create(
						spent({
							amount: 30,
							accountId: asAccount(2),
							issuerId: asIssuer(1),
						}),
					);
					yield* repo.linkTransfer([debit.id, credit.id]);
					yield* repo.create(spent({ amount: -10, issuerId: asIssuer(2) }));

					const recap = yield* repo.recap({});
					assert.strictEqual(byId(recap.byIssuer)[1], undefined);
					assert.deepStrictEqual(byId(recap.byIssuer)[2], {
						id: 2,
						spent: 10,
						count: 1,
					});
					assert.deepStrictEqual(recap.transfers, { total: 30, count: 2 });
				}).pipe(Effect.provide(RepoTest)),
		);

		// **Excluded from recap** through BOTH routes (ADR 0008): the per-row flag
		// and the issuer's default. Read through the shared `recapExclusion`
		// fragment, so the inherited half cannot be left in.
		it.effect("drops excluded rows — flagged and issuer-inherited alike", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (10, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				yield* repo.create(
					spent({
						amount: -50,
						issuerId: asIssuer(1),
						excludedFromRecap: true,
						manualExcluded: true,
					}),
				);
				yield* repo.create(spent({ amount: -70, issuerId: asIssuer(10) }));
				yield* repo.create(spent({ amount: -10, issuerId: asIssuer(2) }));

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(
					recap.byIssuer.map((r) => r.id),
					[asIssuer(2)],
				);
				// Not summarised as a transfer either: nothing moved, there is no
				// counterpart — an excluded row is simply out of the arithmetic.
				assert.deepStrictEqual(recap.transfers, { total: 0, count: 0 });
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);

		// An override the other way: a row inside an excluded issuer, forced back
		// into the recap, is spend again — the predicate follows the derived value.
		it.effect("counts a row forced back into the recap", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (10, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				yield* repo.create(
					spent({
						amount: -70,
						issuerId: asIssuer(10),
						excludedFromRecap: false,
						manualExcluded: true,
					}),
				);

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(byId(recap.byIssuer)[10], {
					id: 10,
					spent: 70,
					count: 1,
				});
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);

		// The third clause: a row the import marked as a duplicate of another is
		// the same money twice, so counting it would overstate the period.
		it.effect("drops duplicate-excluded rows", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(
					spent({
						amount: -25,
						issuerId: asIssuer(1),
						isDuplicateExcluded: true,
					}),
				);
				yield* repo.create(spent({ amount: -10, issuerId: asIssuer(2) }));

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(
					recap.byIssuer.map((r) => r.id),
					[asIssuer(2)],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// A **bundle member** is accounted for by its parent, so counting both would
		// show the same money twice. Stated by `countsTowardRecap` itself since
		// issue #80 — `recap-predicate.test.ts` pins that clause with the predicate
		// alone; this case pins the behaviour through the endpoint the user sees.
		it.effect("counts the bundle parent once, never its members", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(spent({ amount: -200 }));
				const b = yield* repo.create(spent({ amount: 150 }));
				yield* repo.createBundle([a.id, b.id], "Weekend away");

				const recap = yield* repo.recap({});
				// The parent nets to -50 and is the only row in the breakdown.
				assert.deepStrictEqual(byId(recap.byIssuer).none, {
					id: null,
					spent: 50,
					count: 1,
				});
			}).pipe(Effect.provide(RepoTest)),
		);

		// The point of a bundle (issue #76): the weekend reaches the recap as the
		// ONE line the parent stands for, under the issuer and category the user
		// curated onto it — not under whatever its members happened to carry.
		it.effect("counts a bundle under its parent's issuer and category", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					spent({
						amount: -200,
						issuerId: asIssuer(1),
						categoryId: asCategory(3),
						manualCategory: true,
					}),
				);
				const b = yield* repo.create(spent({ amount: 150 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
				yield* repo.update(parent.id, {
					issuerId: asIssuer(4),
					manualIssuer: true,
					categoryId: asCategory(9),
					manualCategory: true,
				});

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(byId(recap.byIssuer)[4], {
					id: 4,
					spent: 50,
					count: 1,
				});
				assert.deepStrictEqual(byId(recap.byCategory)[9], {
					id: 9,
					spent: 50,
					count: 1,
				});
				// The member's own issuer and category are its business, not the
				// recap's: the parent stands for it.
				assert.strictEqual(byId(recap.byIssuer)[1], undefined);
				assert.strictEqual(byId(recap.byCategory)[3], undefined);
			}).pipe(Effect.provide(RepoTest)),
		);

		// A fresh bundle is uncurated like any other row, and lands where any other
		// uncategorised spend lands — reported, never dropped.
		it.effect("counts an uncurated bundle under the Unassigned bucket", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					spent({
						amount: -200,
						categoryId: asCategory(3),
						manualCategory: true,
					}),
				);
				const b = yield* repo.create(spent({ amount: 150 }));
				yield* repo.createBundle([a.id, b.id], "Weekend away");

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(byId(recap.byCategory).none, {
					id: null,
					spent: 50,
					count: 1,
				});
			}).pipe(Effect.provide(RepoTest)),
		);

		// The sign rules apply to a parent with no special case (issue #76): a
		// bundle that sums to a credit is income, and income is not spend. Its
		// members stay hidden all the same — nothing leaks back in through it.
		it.effect("leaves a bundle that sums non-negative out of the spend", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					spent({ amount: -200, issuerId: asIssuer(1) }),
				);
				const b = yield* repo.create(
					spent({ amount: 230, issuerId: asIssuer(2) }),
				);
				yield* repo.createBundle([a.id, b.id], "Overcollected");
				yield* repo.create(spent({ amount: -10, issuerId: asIssuer(5) }));

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(
					recap.byIssuer.map((r) => r.id),
					[asIssuer(5)],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The **regression guard** for issue #80: moving the bundle rule into
		// `countsTowardRecap` was meant to change what the predicate *says*, not
		// what the recap *answers*. So one fixture holding a row of every partition
		// — ordinary spend, a bundle, a transfer pair, both flavours of exclusion,
		// income — with the whole summary asserted as one literal. Any drift in any
		// bucket, in any direction, shows up here as a diff.
		it.effect("answers the same summary for a fixture of every partition", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (10, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				// Ordinary spend, categorised by hand: 25 under issuer 1 / category 7.
				const shop = { issuerId: asIssuer(1), categoryId: asCategory(7) };
				yield* repo.create(
					spent({ amount: -20, ...shop, manualCategory: true }),
				);
				yield* repo.create(
					spent({ amount: -5, ...shop, manualCategory: true }),
				);
				// A bundle: the parent nets to -50 and stands for both members, which
				// carry an issuer and a category of their own that must NOT surface.
				const a = yield* repo.create(
					spent({ amount: -200, ...shop, manualCategory: true }),
				);
				const b = yield* repo.create(spent({ amount: 150 }));
				yield* repo.createBundle([a.id, b.id], "Weekend away");
				// A transfer pair — out of the breakdowns, into the transfer line.
				const debit = yield* repo.create(
					spent({ amount: -30, issuerId: asIssuer(2) }),
				);
				const credit = yield* repo.create(
					spent({ amount: 30, accountId: asAccount(2), issuerId: asIssuer(2) }),
				);
				yield* repo.linkTransfer([debit.id, credit.id]);
				// Excluded by hand, excluded through the issuer, duplicate-excluded.
				yield* repo.create(
					spent({
						amount: -50,
						issuerId: asIssuer(1),
						excludedFromRecap: true,
						manualExcluded: true,
					}),
				);
				yield* repo.create(spent({ amount: -70, issuerId: asIssuer(10) }));
				yield* repo.create(
					spent({
						amount: -25,
						issuerId: asIssuer(1),
						isDuplicateExcluded: true,
					}),
				);
				// Income: not spend, so it reaches no bucket.
				yield* repo.create(spent({ amount: 100, issuerId: asIssuer(1) }));

				assert.deepStrictEqual(yield* repo.recap({}), {
					byIssuer: [
						{ id: null, spent: 50, count: 1 },
						{ id: asIssuer(1), spent: 25, count: 2 },
					],
					byCategory: [
						{ id: null, spent: 50, count: 1 },
						{ id: asCategory(7), spent: 25, count: 2 },
					],
					transfers: { total: 30, count: 2 },
					// The three excluded rows, by all three routes: -50 by hand, -70
					// inherited from the issuer, -25 as a duplicate (issue #87).
					excluded: { total: 145, count: 3 },
				});
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);

		// The excluded line (issue #87) — the complement of the exclusion clause of
		// `countsTowardRecap`, so what it reports is exactly what the breakdowns
		// dropped. Its own tests, because the partition fixture above pins the happy
		// path but not the rows that could land on two lines at once, or on none.
		describe("excluded summary (issue #87)", () => {
			it.effect("reports nothing when nothing is held out", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(spent({ amount: -20 }));
					const recap = yield* repo.recap({});
					assert.deepStrictEqual(recap.excluded, { total: 0, count: 0 });
				}).pipe(Effect.provide(RepoTest)),
			);

			// An excluded leg is absent from the transfer line (which requires `NOT
			// isRecapExcluded`), so it has to be reported HERE — otherwise the row is
			// on neither line and its money is simply unaccounted for. Exclusion wins
			// over the transfer rule, being the statement the user made deliberately.
			it.effect(
				"claims an excluded transfer leg, which no other line reports",
				() =>
					Effect.gen(function* () {
						const repo = yield* TransactionRepo;
						const debit = yield* repo.create(
							spent({ amount: -30, issuerId: asIssuer(2) }),
						);
						const credit = yield* repo.create(
							spent({
								amount: 30,
								accountId: asAccount(2),
								issuerId: asIssuer(2),
							}),
						);
						yield* repo.linkTransfer([debit.id, credit.id]);
						// Exclude the debit leg by hand, after the pairing.
						yield* repo.update(debit.id, {
							excludedFromRecap: true,
							manualExcluded: true,
						});

						const recap = yield* repo.recap({});
						// The pair no longer reads as a clean transfer: only the credit leg
						// remains on that line, and the excluded debit is reported here.
						assert.deepStrictEqual(recap.excluded, { total: 30, count: 1 });
						assert.strictEqual(recap.transfers.count, 1);
						assert.strictEqual(recap.transfers.total, 0);
					}).pipe(Effect.provide(RepoTest)),
			);

			// The parent carries the exclusion decision the user made; counting its
			// members too would report the same money twice.
			it.effect("holds bundle members out, reporting the parent only", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(spent({ amount: -20 }));
					const b = yield* repo.create(spent({ amount: -30 }));
					const parent = yield* repo.createBundle([a.id, b.id], "Weekend");
					yield* repo.update(parent.id, {
						excludedFromRecap: true,
						manualExcluded: true,
					});

					const recap = yield* repo.recap({});
					// The parent's -50, once — not the members' -20 and -30 on top.
					assert.deepStrictEqual(recap.excluded, { total: 50, count: 1 });
				}).pipe(Effect.provide(RepoTest)),
			);

			// `total` sums debit magnitudes, like the transfer line: the figure reads
			// as "money out that isn't in the total above", so a credit must not
			// cancel it — but the row is still counted, because it was held out.
			it.effect("sums debits only, while counting every excluded row", () =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(
						spent({
							amount: -40,
							excludedFromRecap: true,
							manualExcluded: true,
						}),
					);
					yield* repo.create(
						spent({
							amount: 15,
							excludedFromRecap: true,
							manualExcluded: true,
						}),
					);
					const recap = yield* repo.recap({});
					assert.deepStrictEqual(recap.excluded, { total: 40, count: 2 });
				}).pipe(Effect.provide(RepoTest)),
			);

			it.effect(
				"follows the period and account filters like every other line",
				() =>
					Effect.gen(function* () {
						const repo = yield* TransactionRepo;
						const excludedIn = {
							excludedFromRecap: true,
							manualExcluded: true,
						} as const;
						yield* repo.create(
							spent({
								amount: -10,
								date: new Date("2026-01-10T00:00:00.000Z"),
								...excludedIn,
							}),
						);
						yield* repo.create(
							spent({
								amount: -20,
								date: new Date("2026-02-10T00:00:00.000Z"),
								...excludedIn,
							}),
						);
						yield* repo.create(
							spent({
								amount: -40,
								accountId: asAccount(2),
								date: new Date("2026-02-10T00:00:00.000Z"),
								...excludedIn,
							}),
						);

						const february = yield* repo.recap({
							startDate: new Date("2026-02-01T00:00:00.000Z"),
							endDate: new Date("2026-02-28T23:59:59.999Z"),
						});
						assert.deepStrictEqual(february.excluded, { total: 60, count: 2 });

						const oneAccount = yield* repo.recap({
							accountId: [asAccount(2)],
							startDate: new Date("2026-02-01T00:00:00.000Z"),
							endDate: new Date("2026-02-28T23:59:59.999Z"),
						});
						assert.deepStrictEqual(oneAccount.excluded, {
							total: 40,
							count: 1,
						});
					}).pipe(Effect.provide(RepoTest)),
			);
		});

		// The correction at the heart of #71: the period is a bound on the
		// transaction **date**, so a row whose statement landed in another month
		// counts where the money was spent — and both edges of the window are
		// inclusive.
		it.effect("bounds the period on the transaction date, inclusively", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				// Dated in July, imported with August's statement — a late statement.
				yield* repo.create(
					spent({
						amount: -10,
						date: new Date("2026-07-31T22:00:00.000Z"),
						importMonth: "2026-08",
					}),
				);
				// Both edges of the July window, to the millisecond.
				yield* repo.create(
					spent({ amount: -1, date: new Date("2026-07-01T00:00:00.000Z") }),
				);
				yield* repo.create(
					spent({ amount: -2, date: new Date("2026-07-31T23:59:59.999Z") }),
				);
				// Just outside it, dated in August but imported with July's statement.
				yield* repo.create(
					spent({
						amount: -99,
						date: new Date("2026-08-01T00:00:00.000Z"),
						importMonth: "2026-07",
					}),
				);

				const july = yield* repo.recap({
					startDate: new Date("2026-07-01T00:00:00.000Z"),
					endDate: new Date("2026-07-31T23:59:59.999Z"),
				});
				assert.deepStrictEqual(byId(july.byIssuer).none, {
					id: null,
					spent: 13,
					count: 3,
				});

				// The year and the unbounded window are the same bound, widened.
				const year = yield* repo.recap({
					startDate: new Date("2026-01-01T00:00:00.000Z"),
					endDate: new Date("2026-12-31T23:59:59.999Z"),
				});
				assert.strictEqual(byId(year.byIssuer).none?.count, 4);
				assert.strictEqual(
					byId((yield* repo.recap({})).byIssuer).none?.count,
					4,
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("narrows to one account, or to a selection of them", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(spent({ amount: -10, accountId: asAccount(1) }));
				yield* repo.create(spent({ amount: -20, accountId: asAccount(2) }));
				yield* repo.create(spent({ amount: -40, accountId: asAccount(3) }));

				assert.strictEqual(
					byId((yield* repo.recap({ accountId: asAccount(2) })).byIssuer).none
						?.spent,
					20,
				);
				// The picker is multi-select, and the whole selection is ONE query.
				assert.strictEqual(
					byId(
						(yield* repo.recap({ accountId: [asAccount(1), asAccount(3)] }))
							.byIssuer,
					).none?.spent,
					50,
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Amounts are float euros; three of them summed as floats give
		// 0.30000000000000004. The sum runs in integer cents, exactly as
		// `linkTransfer` and `createBundle` compare and add money.
		it.effect(
			"sums in integer cents, so a period of small amounts is exact",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(spent({ amount: -0.1 }));
					yield* repo.create(spent({ amount: -0.2 }));
					yield* repo.create(spent({ amount: -0.1 }));

					const recap = yield* repo.recap({});
					assert.strictEqual(byId(recap.byIssuer).none?.spent, 0.4);
				}).pipe(Effect.provide(RepoTest)),
		);

		// The point of moving this server-side: the old scan reduced at most 1000
		// rows per account and admitted the shortfall with a `truncated` flag.
		// There is no page here, so there is nothing to truncate.
		it.effect("aggregates the whole set, past any page size", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.bulkCreate(
					Array.from({ length: 1200 }, () =>
						spent({ amount: -1, issuerId: asIssuer(1) }),
					),
				);

				const recap = yield* repo.recap({});
				assert.deepStrictEqual(byId(recap.byIssuer)[1], {
					id: 1,
					spent: 1200,
					count: 1200,
				});
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"returns empty breakdowns and no transfers for an empty set",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const recap = yield* repo.recap({});
					assert.deepStrictEqual(recap.byIssuer, []);
					assert.deepStrictEqual(recap.byCategory, []);
					assert.deepStrictEqual(recap.transfers, { total: 0, count: 0 });
				}).pipe(Effect.provide(RepoTest)),
		);

		// The period picker's options, derived from the transaction date like every
		// other period bound — offering an *import* month while filtering on the
		// date is how the two views came to disagree in the first place.
		it.effect(
			"lists the distinct months of the transaction dates, newest first",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					yield* repo.create(
						spent({
							date: new Date("2026-07-15T00:00:00.000Z"),
							importMonth: "2026-08",
						}),
					);
					yield* repo.create(
						spent({
							date: new Date("2026-07-02T00:00:00.000Z"),
							importMonth: "2026-07",
						}),
					);
					yield* repo.create(
						spent({
							date: new Date("2025-12-31T00:00:00.000Z"),
							importMonth: "2026-01",
						}),
					);

					const { months } = yield* repo.recapPeriods();
					assert.deepStrictEqual(months, ["2026-07", "2025-12"]);
				}).pipe(Effect.provide(RepoTest)),
		);
	});

	// Link/unlink internal transfers (PRD #48, issue #50). The atomic multi-row
	// operations validated entirely server-side — tested at the repository seam
	// over the in-memory SQLite layer, the same boundary the handler tests use.
	describe("link/unlink transfer", () => {
		it.effect(
			"links a valid pair and stamps min(id) on every leg as the group id",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(make({ amount: -30 }));
					const b = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2) }),
					);

					const result = yield* repo.linkTransfer([b.id, a.id]);
					assert.strictEqual(result.count, 2);

					// min(ids) is `a.id` (created first), stamped on both legs.
					const groupId = Math.min(a.id, b.id);
					assert.strictEqual(
						(yield* repo.getById(a.id)).transferGroupId,
						groupId,
					);
					assert.strictEqual(
						(yield* repo.getById(b.id)).transferGroupId,
						groupId,
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("links an N-leg group (-100 repaid by +60 and +40)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(make({ amount: -100 }));
				const c1 = yield* repo.create(
					make({ amount: 60, accountId: asAccount(2) }),
				);
				const c2 = yield* repo.create(
					make({ amount: 40, accountId: asAccount(3) }),
				);

				const result = yield* repo.linkTransfer([debit.id, c1.id, c2.id]);
				assert.strictEqual(result.count, 3);

				const groupId = Math.min(debit.id, c1.id, c2.id);
				for (const id of [debit.id, c1.id, c2.id]) {
					assert.strictEqual(
						(yield* repo.getById(id)).transferGroupId,
						groupId,
					);
				}
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("balances in integer cents, not as floats (-10.10 + 10.10)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -10.1 }));
				const b = yield* repo.create(
					make({ amount: 10.1, accountId: asAccount(2) }),
				);
				const result = yield* repo.linkTransfer([a.id, b.id]);
				assert.strictEqual(result.count, 2);
			}).pipe(Effect.provide(RepoTest)),
		);

		// A same-account zero-sum group is accepted: the "≥2 distinct accounts"
		// property is a suggestion-only heuristic, never enforced server-side.
		it.effect("does not enforce ≥2 distinct accounts", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({ amount: -30, accountId: asAccount(1) }),
				);
				const b = yield* repo.create(
					make({ amount: 30, accountId: asAccount(1) }),
				);
				const result = yield* repo.linkTransfer([a.id, b.id]);
				assert.strictEqual(result.count, 2);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("rejects fewer than 2 legs (a set, so dupes collapse)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				// One distinct id (even passed twice) can't form a transfer.
				const error = yield* repo.linkTransfer([a.id, a.id]).pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "too-few-legs" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("rejects a non-zero sum", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({ amount: 25, accountId: asAccount(2) }),
				);
				const error = yield* repo.linkTransfer([a.id, b.id]).pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "unbalanced" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("rejects an unknown (non-existent) id", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const error = yield* repo
					.linkTransfer([a.id, asTx(9999)])
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "unknown-id" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("rejects a leg already carrying a transferGroupId", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([a.id, b.id]);
				// A third balanced set dragging in an already-grouped leg.
				const c = yield* repo.create(
					make({ amount: -30, accountId: asAccount(3) }),
				);
				const error = yield* repo.linkTransfer([a.id, c.id]).pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "already-grouped" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("rejects a leg that is a refund (isRefund set)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30, isRefund: true }));
				const b = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				const error = yield* repo.linkTransfer([a.id, b.id]).pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "is-refund" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("rejects a leg that is refund-paired (linkedRefundId set)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({
						amount: 30,
						accountId: asAccount(2),
						linkedRefundId: a.id,
					}),
				);
				const error = yield* repo.linkTransfer([a.id, b.id]).pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "is-refund" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("a rejected link writes nothing (no partial stamping)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({ amount: 25, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([a.id, b.id]).pipe(Effect.flip);
				assert.strictEqual(
					(yield* repo.getById(a.id)).transferGroupId,
					undefined,
				);
				assert.strictEqual(
					(yield* repo.getById(b.id)).transferGroupId,
					undefined,
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("unlink clears transferGroupId on every leg of the group", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(make({ amount: -100 }));
				const c1 = yield* repo.create(
					make({ amount: 60, accountId: asAccount(2) }),
				);
				const c2 = yield* repo.create(
					make({ amount: 40, accountId: asAccount(3) }),
				);
				yield* repo.linkTransfer([debit.id, c1.id, c2.id]);
				const groupId = Math.min(debit.id, c1.id, c2.id);

				const result = yield* repo.unlinkTransfer(asTx(groupId));
				assert.strictEqual(result.count, 3);
				for (const id of [debit.id, c1.id, c2.id]) {
					assert.strictEqual(
						(yield* repo.getById(id)).transferGroupId,
						undefined,
					);
				}
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("unlink of an unknown group id clears nothing (count 0)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const result = yield* repo.unlinkTransfer(asTx(9999));
				assert.strictEqual(result.count, 0);
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// **Bundle** creation (issue #68, epic #66): several transactions treated as
	// ONE for the recap. The parent is a synthetic row in this same table — so it
	// sorts, pages, filters and is edited like any other — carrying a derived
	// amount (the sum of its members) and the earliest member's date. Members are
	// stamped with `bundleId` and drop out of the top level of the list.
	describe("createBundle (issue #68)", () => {
		it.effect("sums its members' amounts and takes the earliest date", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const spend = yield* repo.create(
					make({
						amount: -200,
						date: new Date("2026-03-07T00:00:00.000Z"),
						rawIssuerString: "GROCERIES",
					}),
				);
				const payback = yield* repo.create(
					make({
						amount: 150,
						date: new Date("2026-03-12T00:00:00.000Z"),
						rawIssuerString: "REVOLUT LUCAS",
					}),
				);

				const parent = yield* repo.createBundle(
					[payback.id, spend.id],
					"Weekend away",
				);

				// The 200 € debit and the 150 € repaid is one 50 € weekend.
				assert.strictEqual(parent.amount, -50);
				// The cost belongs to when the money was spent, not to when the last
				// person settled up.
				assert.deepStrictEqual(
					parent.date,
					new Date("2026-03-07T00:00:00.000Z"),
				);
				assert.strictEqual(parent.kind, "bundle");
				assert.strictEqual(parent.bundleId, undefined);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"stores the label in rawIssuerString, leaving issuer and category unset",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(
						make({ amount: -20, issuerId: asIssuer(3) }),
					);
					const b = yield* repo.create(
						make({
							amount: -5,
							categoryId: asCategory(7),
							manualCategory: true,
						}),
					);

					const parent = yield* repo.createBundle(
						[a.id, b.id],
						"  Weekend away  ",
					);
					// Trimmed: the label is the row's human-readable name, and leading
					// whitespace is not part of it.
					assert.strictEqual(parent.rawIssuerString, "Weekend away");
					assert.strictEqual(parent.issuerId, undefined);
					assert.strictEqual(parent.categoryId, undefined);
					// Bundling never touches a member's own identity.
					assert.strictEqual((yield* repo.getById(a.id)).issuerId, 3);
					assert.strictEqual((yield* repo.getById(b.id)).categoryId, 7);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("stamps bundleId on every member, pointing at the parent", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));

				const parent = yield* repo.createBundle([a.id, b.id], "Trip");

				assert.strictEqual((yield* repo.getById(a.id)).bundleId, parent.id);
				assert.strictEqual((yield* repo.getById(b.id)).bundleId, parent.id);
				assert.strictEqual((yield* repo.getById(a.id)).kind, "bank");
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("sums in integer cents, not as floats (-0.10 + -0.20)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -0.1 }));
				const b = yield* repo.create(make({ amount: -0.2 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Cents");
				assert.strictEqual(parent.amount, -0.3);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses fewer than two members (a set, so dupes collapse)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const error = yield* repo
					.createBundle([a.id, a.id], "Lonely")
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "too-few-members" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses an unknown (non-existent) id", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const error = yield* repo
					.createBundle([a.id, asTx(9999)], "Ghost")
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "unknown-id" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses a member that already belongs to another bundle", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));
				const c = yield* repo.create(make({ amount: -7 }));
				yield* repo.createBundle([a.id, b.id], "First");

				const error = yield* repo
					.createBundle([a.id, c.id], "Second")
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "already-bundled" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The create side of the eligibility cascade `addBundleMember` shares
		// (issue #83). A bundle cannot contain a bundle whichever path proposes it:
		// the outer parent only recomputes when its OWN membership changes, so the
		// inner one moving would leave the outer total stale.
		it.effect("refuses a member that is itself a bundle parent", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));
				const c = yield* repo.create(make({ amount: -7 }));
				const inner = yield* repo.createBundle([a.id, b.id], "Inner");

				const error = yield* repo
					.createBundle([inner.id, c.id], "Outer")
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "nested-bundle" }),
				);
				// Refused means nothing moved: no outer parent, and the inner one is
				// still the two rows it stood for.
				assert.strictEqual((yield* repo.getById(inner.id)).bundleId, undefined);
				assert.strictEqual((yield* repo.list(listAll)).total, 2);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("a refused bundle writes nothing (no parent, no stamping)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				yield* repo.createBundle([a.id, asTx(9999)], "Ghost").pipe(Effect.flip);
				assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
				assert.strictEqual((yield* repo.list(listAll)).total, 1);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Members are accounted for by their parent, so showing both would
		// double-count — in the rows AND in the signed total beneath them.
		it.effect("hides members from the list and its signed total", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const unrelated = yield* repo.create(
					make({ amount: -10, rawIssuerString: "COFFEE" }),
				);
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				const page = yield* repo.list(listAll);
				assert.deepStrictEqual(
					[...page.items.map((t) => t.id)].sort((x, y) => x - y),
					[unrelated.id, parent.id].sort((x, y) => x - y),
				);
				assert.strictEqual(page.total, 2);
				// -50 (the parent) + -10 (the unrelated row) — the members' -200 and
				// +150 are counted once, through the parent.
				assert.strictEqual((yield* repo.count({})).total, -60);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("the bundleId filter lists a bundle's members", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				yield* repo.create(make({ amount: -10 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				const page = yield* repo.list({ ...listAll, bundleId: parent.id });
				assert.deepStrictEqual(
					[...page.items.map((t) => t.id)].sort((x, y) => x - y),
					[a.id, b.id].sort((x, y) => x - y),
				);
				assert.strictEqual(page.total, 2);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("a member is still reachable by id and in bulkGet", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				yield* repo.createBundle([a.id, b.id], "Weekend away");

				assert.strictEqual((yield* repo.getById(a.id)).id, a.id);
				assert.strictEqual((yield* repo.bulkGet([a.id, b.id])).length, 2);
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// Curating a **bundle parent** (issue #72): the parent is a real row, so it is
	// edited through the generic `update` and read through the same derivation and
	// the same curation predicate as any other row — the whole argument for the
	// `kind` discriminator. Only the date carries something of its own: an
	// override, marked `manualDate`, that later membership changes must not undo.
	describe("editing a bundle parent (issue #72)", () => {
		it.effect("takes an issuer, a category and a note like any other row", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				const curated = yield* repo.update(parent.id, {
					issuerId: asIssuer(3),
					manualIssuer: true,
					categoryId: asCategory(7),
					manualCategory: true,
					notes: "Bretagne with the Dupont family",
				});

				assert.strictEqual(curated.issuerId, 3);
				assert.strictEqual(curated.categoryId, 7);
				assert.strictEqual(curated.notes, "Bretagne with the Dupont family");
				// Curating the parent is not renaming it: the label and the derived
				// amount are untouched by an issuer landing on the row.
				assert.strictEqual(curated.rawIssuerString, "Weekend away");
				assert.strictEqual(curated.amount, -50);
				assert.strictEqual(curated.kind, "bundle");
			}).pipe(Effect.provide(RepoTest)),
		);

		// The normal rule, with no special case (issue #72): a fresh parent has a
		// label and nothing else, so it is a to-do exactly like a bare bank row —
		// and setting any one of the three moves it into the complement.
		it.effect("a fresh parent is uncurated; an issuer curates it", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				const todo = yield* repo.list({ ...listAll, uncurated: true });
				assert.deepStrictEqual(
					todo.items.map((t) => t.id),
					[parent.id],
				);

				yield* repo.update(parent.id, {
					issuerId: asIssuer(3),
					manualIssuer: true,
				});

				assert.strictEqual(
					(yield* repo.list({ ...listAll, uncurated: true })).total,
					0,
				);
				const curated = yield* repo.list({ ...listAll, uncurated: false });
				assert.deepStrictEqual(
					curated.items.map((t) => t.id),
					[parent.id],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("a note alone curates the parent", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				yield* repo.update(parent.id, { notes: "Split four ways" });
				assert.strictEqual(
					(yield* repo.list({ ...listAll, uncurated: true })).total,
					0,
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"stores a date override without touching the derived amount",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(
						make({ amount: -200, date: new Date("2026-03-07T00:00:00.000Z") }),
					);
					const b = yield* repo.create(
						make({ amount: 150, date: new Date("2026-03-12T00:00:00.000Z") }),
					);
					const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
					assert.deepStrictEqual(
						parent.date,
						new Date("2026-03-07T00:00:00.000Z"),
					);

					const dated = yield* repo.update(parent.id, {
						date: new Date("2026-02-14T00:00:00.000Z"),
						manualDate: true,
					});

					assert.deepStrictEqual(
						dated.date,
						new Date("2026-02-14T00:00:00.000Z"),
					);
					// `manualDate` is what makes the override outlive the next recompute
					// (#74) — without it the derivation would take the members' date back.
					assert.strictEqual(dated.manualDate, true);
					assert.strictEqual(dated.amount, -50);
					assert.deepStrictEqual(
						(yield* repo.getById(parent.id)).date,
						new Date("2026-02-14T00:00:00.000Z"),
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		// The members are the parent's business, never the other way round: dating
		// the parent leaves every row it stands for exactly where the bank put it.
		it.effect("a date override leaves the members' own dates alone", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({ amount: -200, date: new Date("2026-03-07T00:00:00.000Z") }),
				);
				const b = yield* repo.create(
					make({ amount: 150, date: new Date("2026-03-12T00:00:00.000Z") }),
				);
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				yield* repo.update(parent.id, {
					date: new Date("2026-02-14T00:00:00.000Z"),
					manualDate: true,
				});

				assert.deepStrictEqual(
					(yield* repo.getById(a.id)).date,
					new Date("2026-03-07T00:00:00.000Z"),
				);
				assert.strictEqual((yield* repo.getById(b.id)).manualDate, undefined);
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// The members of the parents ON A PAGE ride along WITH that page (issue #73),
	// so the table can expand a parent in place without a fetch per row. They
	// travel in their own field, never in `items`: the page and the signed total
	// are the top-level set, and a member counted there would be counted twice.
	describe("bundle members ride with the list (issue #73)", () => {
		it.effect("ships a parent's members beside the page, not inside it", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				yield* repo.create(make({ amount: -10, rawIssuerString: "COFFEE" }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				const page = yield* repo.list(listAll);

				assert.deepStrictEqual(
					[...page.bundleMembers.map((t) => t.id)].sort((x, y) => x - y),
					[a.id, b.id].sort((x, y) => x - y),
				);
				// Every member points back at the parent it is shown under.
				assert.ok(page.bundleMembers.every((m) => m.bundleId === parent.id));
				// The page itself is unchanged: two top-level rows, and the signed
				// total still counts the members once, through their parent.
				assert.strictEqual(page.items.length, 2);
				assert.strictEqual(page.total, 2);
				assert.ok(!page.items.some((t) => t.id === a.id || t.id === b.id));
				assert.strictEqual((yield* repo.count({})).total, -60);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("carries no members when the page holds no parent", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(make({ amount: -10 }));
				const page = yield* repo.list(listAll);
				assert.deepStrictEqual(page.bundleMembers, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Only what is on screen: a parent the user has paged past ships nothing,
		// or the field would grow with the table rather than with the page.
		it.effect("carries only the members of the parents on this page", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));
				const c = yield* repo.create(make({ amount: -7 }));
				const d = yield* repo.create(make({ amount: -3 }));
				const first = yield* repo.createBundle([a.id, b.id], "First");
				yield* repo.createBundle([c.id, d.id], "Second");

				// Natural (id) order, one row at a time — the first parent only.
				const page = yield* repo.list({ ...listAll, limit: 1 });
				assert.deepStrictEqual(
					page.items.map((t) => t.id),
					[first.id],
				);
				assert.deepStrictEqual(
					[...page.bundleMembers.map((t) => t.id)].sort((x, y) => x - y),
					[a.id, b.id].sort((x, y) => x - y),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The members ride through the same projection as the rows (ADR 0002/0008):
		// a member's category and recap exclusion are read through its own issuer,
		// so it reads the same expanded under its parent as it does anywhere else.
		it.effect("projects a member's derived fields like any other row", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, defaultCategoryId, excludedFromRecap, createdAt, firstSeen) VALUES (7, 'Carrefour', 4, 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				const a = yield* repo.create(
					make({ amount: -20, issuerId: asIssuer(7) }),
				);
				const b = yield* repo.create(make({ amount: -5 }));
				yield* repo.createBundle([a.id, b.id], "Weekend away");

				const page = yield* repo.list(listAll);
				const member = page.bundleMembers.find((m) => m.id === a.id);
				assert.strictEqual(member?.categoryId, 4);
				assert.strictEqual(member?.excludedFromRecap, true);
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);
	});

	// A bundle is not finished at creation (issue #74): the refund lands a week
	// later, someone pays back in two instalments, the wrong row got swept in.
	// Every membership change moves the parent's derived amount and its default
	// date, so all three paths — add, remove, dissolve — recompute through the ONE
	// routine, and a bundle that drops below two members is dissolved rather than
	// left standing for a single transaction.
	describe("changing a bundle's membership (issue #74)", () => {
		it.effect("adding a member recomputes the parent's amount and date", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const spend = yield* repo.create(
					make({ amount: -200, date: new Date("2026-03-07T00:00:00.000Z") }),
				);
				const payback = yield* repo.create(
					make({ amount: 150, date: new Date("2026-03-12T00:00:00.000Z") }),
				);
				const parent = yield* repo.createBundle(
					[spend.id, payback.id],
					"Weekend away",
				);
				assert.strictEqual(parent.amount, -50);

				// The second instalment, arriving a fortnight after the bundle was made.
				const late = yield* repo.create(
					make({ amount: 30, date: new Date("2026-03-26T00:00:00.000Z") }),
				);
				const updated = yield* repo.addBundleMember(parent.id, late.id);

				assert.strictEqual(updated.amount, -20);
				assert.strictEqual((yield* repo.getById(late.id)).bundleId, parent.id);
				// The date still belongs to the earliest member, which has not moved.
				assert.deepStrictEqual(
					updated.date,
					new Date("2026-03-07T00:00:00.000Z"),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("a member joining earlier pulls the parent's date back", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({ amount: -200, date: new Date("2026-03-07T00:00:00.000Z") }),
				);
				const b = yield* repo.create(
					make({ amount: 150, date: new Date("2026-03-12T00:00:00.000Z") }),
				);
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
				const earlier = yield* repo.create(
					make({
						amount: -30,
						date: new Date("2026-03-01T00:00:00.000Z"),
						accountId: asAccount(4),
						importMonth: "2026-02",
					}),
				);

				const updated = yield* repo.addBundleMember(parent.id, earlier.id);
				assert.deepStrictEqual(
					updated.date,
					new Date("2026-03-01T00:00:00.000Z"),
				);
				// The parent sits where the row it takes its date from sits.
				assert.strictEqual(updated.accountId, 4);
				assert.strictEqual(updated.importMonth, "2026-02");
			}).pipe(Effect.provide(RepoTest)),
		);

		// The whole reason `manualDate` exists (#72): the derived date is a starting
		// point, so an override the user typed outlives every later recompute.
		it.effect("a recompute keeps the parent's overridden date", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({ amount: -200, date: new Date("2026-03-07T00:00:00.000Z") }),
				);
				const b = yield* repo.create(
					make({ amount: 150, date: new Date("2026-03-12T00:00:00.000Z") }),
				);
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
				yield* repo.update(parent.id, {
					date: new Date("2026-02-14T00:00:00.000Z"),
					manualDate: true,
				});

				const earlier = yield* repo.create(
					make({ amount: -30, date: new Date("2026-01-05T00:00:00.000Z") }),
				);
				const updated = yield* repo.addBundleMember(parent.id, earlier.id);

				assert.deepStrictEqual(
					updated.date,
					new Date("2026-02-14T00:00:00.000Z"),
				);
				// The amount is derived all the same — only the date is the user's.
				assert.strictEqual(updated.amount, -80);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses to add a row that already belongs to a bundle", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));
				const c = yield* repo.create(make({ amount: -7 }));
				const d = yield* repo.create(make({ amount: -3 }));
				const first = yield* repo.createBundle([a.id, b.id], "First");
				const second = yield* repo.createBundle([c.id, d.id], "Second");

				const error = yield* repo
					.addBundleMember(second.id, a.id)
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "already-bundled" }),
				);
				// Refused means nothing moved: the row is still the first bundle's.
				assert.strictEqual((yield* repo.getById(a.id)).bundleId, first.id);
				assert.strictEqual((yield* repo.getById(second.id)).amount, -10);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses an unknown bundle and an unknown transaction", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Trip");
				const loose = yield* repo.create(make({ amount: -7 }));

				assert.deepStrictEqual(
					yield* repo.addBundleMember(asTx(9999), loose.id).pipe(Effect.flip),
					new BundleInvalid({ reason: "unknown-id" }),
				);
				assert.deepStrictEqual(
					yield* repo.addBundleMember(parent.id, asTx(9999)).pipe(Effect.flip),
					new BundleInvalid({ reason: "unknown-id" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses to add to a row that is not a bundle parent", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const bank = yield* repo.create(make({ amount: -20 }));
				const other = yield* repo.create(make({ amount: -5 }));

				const error = yield* repo
					.addBundleMember(bank.id, other.id)
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "not-a-bundle" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// A parent inside a parent would put a bundle's number in two places: the
		// outer one only recomputes when its OWN membership changes, so editing the
		// inner bundle would leave the outer total stale — the exact staleness this
		// slice exists to close.
		it.effect("refuses to nest one bundle parent inside another", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));
				const c = yield* repo.create(make({ amount: -7 }));
				const d = yield* repo.create(make({ amount: -3 }));
				const first = yield* repo.createBundle([a.id, b.id], "First");
				const second = yield* repo.createBundle([c.id, d.id], "Second");

				assert.deepStrictEqual(
					yield* repo.addBundleMember(second.id, first.id).pipe(Effect.flip),
					new BundleInvalid({ reason: "nested-bundle" }),
				);
				// Including into itself, which is the same rule.
				assert.deepStrictEqual(
					yield* repo.addBundleMember(first.id, first.id).pipe(Effect.flip),
					new BundleInvalid({ reason: "nested-bundle" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"removing a member returns it to the list and recomputes the parent",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(
						make({ amount: -200, date: new Date("2026-03-07T00:00:00.000Z") }),
					);
					const b = yield* repo.create(
						make({ amount: 150, date: new Date("2026-03-12T00:00:00.000Z") }),
					);
					const c = yield* repo.create(
						make({ amount: 30, date: new Date("2026-03-26T00:00:00.000Z") }),
					);
					const parent = yield* repo.createBundle(
						[a.id, b.id, c.id],
						"Weekend away",
					);
					assert.strictEqual(parent.amount, -20);

					const released = yield* repo.removeBundleMember(c.id);

					assert.strictEqual(released.id, c.id);
					assert.strictEqual(released.bundleId, undefined);
					assert.strictEqual((yield* repo.getById(parent.id)).amount, -50);
					// Back at the top level of the list, counted in its own right.
					const page = yield* repo.list(listAll);
					assert.ok(page.items.some((t) => t.id === c.id));
				}).pipe(Effect.provide(RepoTest)),
		);

		// Bundling never touched the member's own identity, so releasing it gives
		// back exactly the row that went in.
		it.effect("a released member keeps its issuer, category and notes", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({
						amount: -200,
						issuerId: asIssuer(3),
						manualIssuer: true,
						categoryId: asCategory(7),
						manualCategory: true,
						notes: "Half the shop was theirs",
					}),
				);
				const b = yield* repo.create(make({ amount: 150 }));
				const c = yield* repo.create(make({ amount: 30 }));
				yield* repo.createBundle([a.id, b.id, c.id], "Weekend away");

				const released = yield* repo.removeBundleMember(a.id);
				assert.strictEqual(released.issuerId, 3);
				assert.strictEqual(released.categoryId, 7);
				assert.strictEqual(released.notes, "Half the shop was theirs");
			}).pipe(Effect.provide(RepoTest)),
		);

		// A bundle standing for one transaction is that transaction with extra
		// steps, so it dissolves rather than surviving as a degenerate parent.
		it.effect("a bundle dropping below two members dissolves itself", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");

				yield* repo.removeBundleMember(b.id);

				// The parent is gone and the survivor is an ordinary row again.
				assert.deepStrictEqual(
					yield* repo.getById(parent.id).pipe(Effect.flip),
					new NotFound({ resource: "transaction", id: parent.id }),
				);
				assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
				const page = yield* repo.list(listAll);
				assert.deepStrictEqual(
					[...page.items.map((t) => t.id)].sort((x, y) => x - y),
					[a.id, b.id].sort((x, y) => x - y),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses to remove a row that is in no bundle", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const loose = yield* repo.create(make({ amount: -20 }));

				assert.deepStrictEqual(
					yield* repo.removeBundleMember(loose.id).pipe(Effect.flip),
					new BundleInvalid({ reason: "not-a-member" }),
				);
				assert.deepStrictEqual(
					yield* repo.removeBundleMember(asTx(9999)).pipe(Effect.flip),
					new BundleInvalid({ reason: "unknown-id" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("dissolving deletes the parent and releases every member", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({ amount: -200, notes: "Bretagne", issuerId: asIssuer(3) }),
				);
				const b = yield* repo.create(make({ amount: 150 }));
				const c = yield* repo.create(make({ amount: 30 }));
				const parent = yield* repo.createBundle([a.id, b.id, c.id], "Weekend");

				const result = yield* repo.dissolveBundle(parent.id);

				assert.strictEqual(result.count, 3);
				assert.deepStrictEqual(
					yield* repo.getById(parent.id).pipe(Effect.flip),
					new NotFound({ resource: "transaction", id: parent.id }),
				);
				// The members come back exactly as they were.
				assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
				assert.strictEqual((yield* repo.getById(a.id)).notes, "Bretagne");
				assert.strictEqual((yield* repo.getById(a.id)).issuerId, 3);
				assert.strictEqual((yield* repo.list(listAll)).total, 3);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Idempotent like `unlinkTransfer`: there is nothing to fail on, and a
		// `kind` guard keeps a bank row's id from deleting the row itself.
		it.effect("dissolving an unknown id or a bank row does nothing", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const bank = yield* repo.create(make({ amount: -20 }));

				assert.strictEqual((yield* repo.dissolveBundle(asTx(9999))).count, 0);
				assert.strictEqual((yield* repo.dissolveBundle(bank.id)).count, 0);
				assert.strictEqual((yield* repo.getById(bank.id)).id, bank.id);
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// Deleting a row that is part of a bundle goes through the SAME cleanup the
	// transfer groups already use (issue #74), so no delete path can leave a
	// parent summing a row that is gone, or a member pointing at a parent that is.
	describe("bundles survive every delete path (issue #74)", () => {
		it.effect("deleting a member recomputes the parent it left", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const c = yield* repo.create(make({ amount: 30 }));
				const parent = yield* repo.createBundle([a.id, b.id, c.id], "Weekend");

				yield* repo.remove(c.id);

				assert.strictEqual((yield* repo.getById(parent.id)).amount, -50);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("deleting the second-to-last member dissolves the bundle", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend");

				yield* repo.remove(b.id);

				assert.deepStrictEqual(
					yield* repo.getById(parent.id).pipe(Effect.flip),
					new NotFound({ resource: "transaction", id: parent.id }),
				);
				assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The parent stands for its members; it does not own them. Deleting it is
		// dissolving the bundle, not deleting three bank rows.
		it.effect(
			"deleting the parent releases its members, never deletes them",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(make({ amount: -200 }));
					const b = yield* repo.create(make({ amount: 150 }));
					const parent = yield* repo.createBundle([a.id, b.id], "Weekend");

					yield* repo.remove(parent.id);

					assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
					assert.strictEqual((yield* repo.getById(b.id)).bundleId, undefined);
					assert.strictEqual((yield* repo.list(listAll)).total, 2);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("bulkDelete of a member runs the same recompute", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const c = yield* repo.create(make({ amount: 30 }));
				const parent = yield* repo.createBundle([a.id, b.id, c.id], "Weekend");

				assert.strictEqual((yield* repo.bulkDelete([c.id])).count, 1);
				assert.strictEqual((yield* repo.getById(parent.id)).amount, -50);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Both halves at once: the parent's members are released, and the recompute
		// asked for by the deleted member finds no parent left to update.
		it.effect(
			"a bulk delete of a parent AND a member leaves nothing dangling",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(make({ amount: -200 }));
					const b = yield* repo.create(make({ amount: 150 }));
					const parent = yield* repo.createBundle([a.id, b.id], "Weekend");

					assert.strictEqual(
						(yield* repo.bulkDelete([parent.id, b.id])).count,
						2,
					);
					assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
					assert.strictEqual((yield* repo.list(listAll)).total, 1);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"deleteByImportBatch releases the members of a deleted parent",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(
						make({ amount: -200, importBatchId: "batch-1" }),
					);
					const b = yield* repo.create(
						make({ amount: 150, importBatchId: "batch-1" }),
					);
					yield* repo.createBundle([a.id, b.id], "Weekend");

					// The whole batch is dropped: the bundle is dissolved first (issue
					// #77), so the parent is gone before the delete runs and the count is
					// the two *bank* rows the batch brought in — the synthetic parent
					// carries no batch id and was never one of them. Nothing is left
					// behind either way.
					assert.strictEqual(
						(yield* repo.deleteByImportBatch("batch-1")).count,
						2,
					);
					assert.strictEqual((yield* repo.list(listAll)).total, 0);
				}).pipe(Effect.provide(RepoTest)),
		);
	});

	// The **non-negative bundle** anomaly (issue #76). A bundle is a cost told in
	// several rows, so it sums to a debit; zero or a credit is handled by the
	// ordinary sign rules with no special case, but it usually means a
	// mis-bundling — a member added by mistake, a refund counted twice. So the
	// parent carries a soft flag, raised beside the amount by the ONE recompute
	// every membership change already runs, and cleared the moment the bundle is
	// a cost again. It warns: nothing is refused and no amount moves.
	describe("a bundle that is not a cost is flagged (issue #76)", () => {
		/** The anomaly kinds standing on a row, in order. */
		const flagsOf = (txn: { anomalyFlags?: ReadonlyArray<{ type: string }> }) =>
			(txn.anomalyFlags ?? []).map((f) => f.type);

		it.effect("flags a fresh bundle whose members sum to a credit", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const spend = yield* repo.create(make({ amount: -200 }));
				const payback = yield* repo.create(make({ amount: 230 }));

				const parent = yield* repo.createBundle(
					[spend.id, payback.id],
					"Overcollected",
				);

				assert.deepStrictEqual(flagsOf(parent), ["non-negative-bundle"]);
				// The flag warns; it does not alter the sum the members state.
				assert.strictEqual(parent.amount, 30);
				assert.deepStrictEqual(flagsOf(yield* repo.getById(parent.id)), [
					"non-negative-bundle",
				]);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("flags a bundle whose members cancel out exactly", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const spend = yield* repo.create(make({ amount: -200 }));
				const payback = yield* repo.create(make({ amount: 200 }));

				const parent = yield* repo.createBundle(
					[spend.id, payback.id],
					"Paid back in full",
				);
				assert.strictEqual(parent.amount, 0);
				assert.deepStrictEqual(flagsOf(parent), ["non-negative-bundle"]);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("leaves an ordinary bundle unflagged", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));

				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
				assert.strictEqual(parent.amount, -50);
				assert.strictEqual(parent.anomalyFlags, undefined);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The flag is re-evaluated wherever the amount is: adding the refund twice
		// raises it, and the correcting removal takes it away again.
		it.effect("raises and clears the flag as membership changes", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
				const twice = yield* repo.create(make({ amount: 150 }));

				const flagged = yield* repo.addBundleMember(parent.id, twice.id);
				assert.strictEqual(flagged.amount, 100);
				assert.deepStrictEqual(flagsOf(flagged), ["non-negative-bundle"]);

				yield* repo.removeBundleMember(twice.id);
				const fixed = yield* repo.getById(parent.id);
				assert.strictEqual(fixed.amount, -50);
				assert.deepStrictEqual(flagsOf(fixed), []);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Deleting a member is a membership change like any other, and goes through
		// the same cleanup — so it moves the flag too.
		it.effect("flags a parent left non-negative by a deleted member", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const spend = yield* repo.create(make({ amount: -200 }));
				const other = yield* repo.create(make({ amount: -20 }));
				const payback = yield* repo.create(make({ amount: 150 }));
				const parent = yield* repo.createBundle(
					[spend.id, other.id, payback.id],
					"Weekend away",
				);
				assert.strictEqual(parent.amount, -70);

				// The big charge turns out to be someone else's row entirely.
				yield* repo.remove(spend.id);

				const left = yield* repo.getById(parent.id);
				assert.strictEqual(left.amount, 130);
				assert.deepStrictEqual(flagsOf(left), ["non-negative-bundle"]);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The flag is the bundle's own business: anything else already on the row
		// is left exactly as it was, in both directions.
		it.effect("leaves every other anomaly flag on the parent alone", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 230 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Overcollected");
				yield* repo.update(parent.id, {
					anomalyFlags: [
						new AnomalyFlag({
							type: "high-amount",
							reason: "8× the usual",
							detectedAt: "2026-03-01T00:00:00.000Z",
							dismissed: false,
						}),
						...(parent.anomalyFlags ?? []),
					],
				});

				const fix = yield* repo.create(make({ amount: -400 }));
				const fixed = yield* repo.addBundleMember(parent.id, fix.id);
				assert.strictEqual(fixed.amount, -370);
				assert.deepStrictEqual(flagsOf(fixed), ["high-amount"]);
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// A scoped delete takes whole sets of rows at once, so a bundle touching the
	// scope cannot survive it: some of its members are about to stop existing
	// (issue #77). Rather than leave a parent standing for a set that silently
	// shrank, every touched bundle is dissolved — and counted first, so the
	// caller can say so before the rows go. `bundleImpact` is that count; since
	// issue #88 the scope it asks about is no longer one an import deletes.
	describe("a scoped delete dissolves the bundles it touches (issue #77)", () => {
		it.effect("counts a bundle wholly inside the target account+month", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				yield* repo.createBundle([a.id, b.id], "Weekend");

				assert.deepStrictEqual(
					yield* repo.bundleImpact(asAccount(1), "2026-03"),
					{ count: 1 },
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The parent is stamped with the EARLIEST member's month, so the later
		// month holds only a member — the case a scan for parents would miss.
		it.effect("counts a bundle only partly inside the target month", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({
						amount: -200,
						date: new Date("2026-03-02"),
						importMonth: "2026-03",
					}),
				);
				const b = yield* repo.create(
					make({
						amount: 150,
						date: new Date("2026-04-02"),
						importMonth: "2026-04",
					}),
				);
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend");
				assert.strictEqual(parent.importMonth, "2026-03");

				assert.deepStrictEqual(
					yield* repo.bundleImpact(asAccount(1), "2026-04"),
					{ count: 1 },
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("counts a bundle only partly inside the target account", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(
					make({ amount: 150, accountId: asAccount(2) }),
				);
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend");
				assert.strictEqual(parent.accountId, asAccount(1));

				assert.deepStrictEqual(
					yield* repo.bundleImpact(asAccount(2), "2026-03"),
					{ count: 1 },
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Two bundles touching the month are two, and one bundle touched through
		// several of its rows is still one — the count is of bundles, not rows.
		it.effect("counts each touched bundle once", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				const c = yield* repo.create(make({ amount: -30 }));
				const d = yield* repo.create(make({ amount: 10 }));
				yield* repo.createBundle([a.id, b.id], "Weekend");
				yield* repo.createBundle([c.id, d.id], "Lunch");

				assert.deepStrictEqual(
					yield* repo.bundleImpact(asAccount(1), "2026-03"),
					{ count: 2 },
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("counts nothing when the month holds no bundled row", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -200 }));
				const b = yield* repo.create(make({ amount: 150 }));
				yield* repo.createBundle([a.id, b.id], "Weekend");

				assert.deepStrictEqual(
					yield* repo.bundleImpact(asAccount(1), "2026-04"),
					{ count: 0 },
				);
				assert.deepStrictEqual(
					yield* repo.bundleImpact(asAccount(2), "2026-03"),
					{ count: 0 },
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// Three members so the survivors are still ≥2: without the dissolve the
		// parent would be *recomputed* and quietly stand for a smaller set. The
		// parent carries no `importBatchId` (it is synthetic, no import made it),
		// so a batch delete can never take it directly — only the dissolve.
		it.effect(
			"deleteByImportBatch dissolves the bundles the batch touches",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(
						make({ amount: -200, importBatchId: "batch-1" }),
					);
					const b = yield* repo.create(
						make({ amount: -30, importBatchId: "batch-1" }),
					);
					const c = yield* repo.create(
						make({ amount: 150, importBatchId: "batch-2" }),
					);
					const parent = yield* repo.createBundle(
						[a.id, b.id, c.id],
						"Weekend",
					);

					assert.strictEqual(
						(yield* repo.deleteByImportBatch("batch-2")).count,
						1,
					);
					assert.deepStrictEqual(
						yield* repo.getById(parent.id).pipe(Effect.flip),
						new NotFound({ resource: "transaction", id: parent.id }),
					);
					assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
					assert.strictEqual((yield* repo.getById(b.id)).bundleId, undefined);
				}).pipe(Effect.provide(RepoTest)),
		);

		// No orphan can outlive a scoped delete: not a member pointing at a parent
		// that is gone, and not a parent summing rows that are.
		it.effect("leaves no dangling bundleId after a scoped delete", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(
					make({ amount: -200, importBatchId: "batch-1" }),
				);
				const b = yield* repo.create(
					make({ amount: -30, importBatchId: "batch-1" }),
				);
				const c = yield* repo.create(
					make({ amount: 150, importBatchId: "batch-2" }),
				);
				yield* repo.createBundle([a.id, b.id, c.id], "Weekend");

				yield* repo.deleteByImportBatch("batch-1");

				const rows = yield* repo.list(listAll);
				assert.strictEqual(rows.total, 1);
				assert.strictEqual(rows.items[0]?.id, c.id);
				assert.strictEqual(rows.items[0]?.bundleId, undefined);
				assert.strictEqual(rows.items[0]?.kind, "bank");
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// Auto-dissolve undersized transfer groups on leg deletion (PRD #48, issue
	// #52). The grouping invariant (≥2 legs) must survive every delete path: a
	// leg whose removal drops its group below 2 legs leaves the survivor(s)
	// reverting to normal transactions — never a dangling one-sided "transfer".
	// One shared cleanup covers the single-delete and every bulk-delete path.
	describe("auto-dissolve transfer groups on delete", () => {
		it.effect(
			"single delete of one leg of a two-leg group clears the survivor",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const a = yield* repo.create(make({ amount: -30 }));
					const b = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2) }),
					);
					yield* repo.linkTransfer([a.id, b.id]);

					yield* repo.remove(a.id);
					assert.strictEqual(
						(yield* repo.getById(b.id)).transferGroupId,
						undefined,
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"single delete of one leg of an N-leg group (N > 2) keeps the rest grouped",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const debit = yield* repo.create(make({ amount: -100 }));
					const c1 = yield* repo.create(
						make({ amount: 60, accountId: asAccount(2) }),
					);
					const c2 = yield* repo.create(
						make({ amount: 40, accountId: asAccount(3) }),
					);
					yield* repo.linkTransfer([debit.id, c1.id, c2.id]);
					const groupId = Math.min(debit.id, c1.id, c2.id);

					// Drop one credit — two legs remain, so the group stays intact.
					yield* repo.remove(c2.id);
					assert.strictEqual(
						(yield* repo.getById(debit.id)).transferGroupId,
						groupId,
					);
					assert.strictEqual(
						(yield* repo.getById(c1.id)).transferGroupId,
						groupId,
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("bulkDelete auto-dissolves a group dropped below 2 legs", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([a.id, b.id]);

				const result = yield* repo.bulkDelete([a.id]);
				assert.strictEqual(result.count, 1);
				assert.strictEqual(
					(yield* repo.getById(b.id)).transferGroupId,
					undefined,
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"deleteByImportBatch auto-dissolves a group whose survivor is elsewhere",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					// Legs in different accounts/batches so dropping one batch removes
					// exactly one leg, leaving the cross-account survivor.
					const a = yield* repo.create(
						make({ amount: -30, importBatchId: "batch-1" }),
					);
					const b = yield* repo.create(
						make({
							amount: 30,
							accountId: asAccount(2),
							importBatchId: "batch-2",
						}),
					);
					yield* repo.linkTransfer([a.id, b.id]);

					const result = yield* repo.deleteByImportBatch("batch-1");
					assert.strictEqual(result.count, 1);
					assert.strictEqual(
						(yield* repo.getById(b.id)).transferGroupId,
						undefined,
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"a bulk delete of an entire N-leg group leaves nothing dangling",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const debit = yield* repo.create(make({ amount: -100 }));
					const c1 = yield* repo.create(
						make({ amount: 60, accountId: asAccount(2) }),
					);
					const c2 = yield* repo.create(
						make({ amount: 40, accountId: asAccount(3) }),
					);
					yield* repo.linkTransfer([debit.id, c1.id, c2.id]);

					// Delete two of three legs: the lone survivor drops below 2 → cleared.
					const result = yield* repo.bulkDelete([debit.id, c1.id]);
					assert.strictEqual(result.count, 2);
					assert.strictEqual(
						(yield* repo.getById(c2.id)).transferGroupId,
						undefined,
					);
				}).pipe(Effect.provide(RepoTest)),
		);
	});

	describe("suggestTransfers (internal-transfer counterparts)", () => {
		// A target debit and a set of candidates seeded around it; the target is
		// always -30 on account 1, so a counterpart is +30 on another account
		// within the window. `DATE` is 2026-03-01.
		const day = (n: number) =>
			new Date(`2026-03-${String(n).padStart(2, "0")}T00:00:00.000Z`);

		// A **dismissed pair** is refused everywhere, not only on the grouped read
		// (issue #91 story 17): "never reappears" is a property of the pairing, so
		// it cannot depend on which endpoint asked. Both orientations, since the
		// target here can be either side of the stored pair.
		it.effect("never suggests a dismissed counterpart, from either side", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(make({ amount: -30 }));
				const credit = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				const kept = yield* repo.create(
					make({ amount: 30, accountId: asAccount(3) }),
				);

				yield* repo.dismissTransferPairs([
					{ debitId: debit.id, creditId: credit.id },
				]);

				// Asking as the debit: the refused credit is gone, the other stays.
				assert.deepStrictEqual(
					(yield* repo.suggestTransfers(debit.id)).map((t) => t.id),
					[kept.id],
				);
				// Asking as the credit: the same pairing, refused the same way.
				assert.deepStrictEqual(yield* repo.suggestTransfers(credit.id), []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"suggests an opposite-sign, equal-magnitude, cross-account leg",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const target = yield* repo.create(make({ amount: -30 }));
					const match = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2) }),
					);

					const out = yield* repo.suggestTransfers(target.id);
					assert.deepStrictEqual(
						out.map((t) => t.id),
						[match.id],
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("excludes a same-sign row (no debit⇄credit repayment)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: -30 }));
				yield* repo.create(make({ amount: -30, accountId: asAccount(2) }));

				const out = yield* repo.suggestTransfers(target.id);
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"excludes a different magnitude (cent-exact match required)",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const target = yield* repo.create(make({ amount: -30 }));
					yield* repo.create(make({ amount: 30.01, accountId: asAccount(2) }));

					const out = yield* repo.suggestTransfers(target.id);
					assert.deepStrictEqual(out, []);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("matches magnitude in integer cents (-10.10 ⇄ +10.10)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: -10.1 }));
				const match = yield* repo.create(
					make({ amount: 10.1, accountId: asAccount(2) }),
				);

				const out = yield* repo.suggestTransfers(target.id);
				assert.deepStrictEqual(
					out.map((t) => t.id),
					[match.id],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"excludes a same-account leg (a transfer moves between accounts)",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const target = yield* repo.create(make({ amount: -30 }));
					yield* repo.create(make({ amount: 30, accountId: asAccount(1) }));

					const out = yield* repo.suggestTransfers(target.id);
					assert.deepStrictEqual(out, []);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"includes a leg exactly TRANSFER_DATE_WINDOW_DAYS away, excludes one past it",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					// Target on the 6th so the window (±5) spans the 1st..11th.
					const target = yield* repo.create(
						make({ amount: -30, date: day(6) }),
					);
					const justInside = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2), date: day(11) }),
					);
					// The 12th is 6 days out — one past the window.
					yield* repo.create(
						make({ amount: 30, accountId: asAccount(3), date: day(12) }),
					);

					const out = yield* repo.suggestTransfers(target.id);
					assert.deepStrictEqual(
						out.map((t) => t.id),
						[justInside.id],
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("excludes a candidate already in a transfer group", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: -30 }));
				const grouped = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				const other = yield* repo.create(
					make({ amount: -30, accountId: asAccount(3) }),
				);
				// `grouped` now carries a transferGroupId, so it can't be re-suggested.
				yield* repo.linkTransfer([grouped.id, other.id]);

				const out = yield* repo.suggestTransfers(target.id);
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("excludes a refund candidate", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: -30 }));
				yield* repo.create(
					make({ amount: 30, accountId: asAccount(2), isRefund: true }),
				);

				const out = yield* repo.suggestTransfers(target.id);
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("returns [] for an already-grouped target (ineligible)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([a.id, b.id]);
				// A would-be counterpart exists, but `a` is grouped → nothing to suggest.
				yield* repo.create(make({ amount: 30, accountId: asAccount(3) }));

				const out = yield* repo.suggestTransfers(a.id);
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("returns [] for a refund target (ineligible)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(
					make({ amount: -30, isRefund: true }),
				);
				yield* repo.create(make({ amount: 30, accountId: asAccount(2) }));

				const out = yield* repo.suggestTransfers(target.id);
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("returns [] for a zero-amount target (nothing to net)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: 0 }));
				yield* repo.create(make({ amount: 0, accountId: asAccount(2) }));

				const out = yield* repo.suggestTransfers(target.id);
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("404s an unknown id", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const error = yield* repo
					.suggestTransfers(asTx(9999))
					.pipe(Effect.flip);
				assert.strictEqual(error._tag, "NotFound");
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("orders candidates nearest-date first", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: -30, date: day(6) }));
				// Two counterparts, one 3 days out, one 1 day out — nearest leads.
				const far = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2), date: day(9) }),
				);
				const near = yield* repo.create(
					make({ amount: 30, accountId: asAccount(3), date: day(7) }),
				);

				const out = yield* repo.suggestTransfers(target.id);
				assert.deepStrictEqual(
					out.map((t) => t.id),
					[near.id, far.id],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The candidate projection is a second read of the same rows, so it must
		// derive exclusion through the candidate's OWN issuer exactly as it already
		// derives the category (ADR 0008) — otherwise the same transaction reads
		// excluded in the list and counted in the suggestion.
		it.effect("a candidate derives exclusion through its own issuer", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (4, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				const target = yield* repo.create(make({ amount: -30 }));
				yield* repo.create(
					make({
						amount: 30,
						accountId: asAccount(2),
						issuerId: asIssuer(4),
					}),
				);

				const out = yield* repo.suggestTransfers(target.id);
				assert.strictEqual(out[0]?.excludedFromRecap, true);
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);
	});

	describe("transferCandidates (detected transfers, grouped by debit leg)", () => {
		const day = (n: number) =>
			new Date(`2026-03-${String(n).padStart(2, "0")}T00:00:00.000Z`);

		it.effect("groups each pair under its debit leg, oriented by sign", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(
					make({ amount: -30, accountId: asAccount(1) }),
				);
				const credit = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);

				const out = yield* repo.transferCandidates();
				assert.strictEqual(out.length, 1);
				assert.strictEqual(out[0].leg.id, debit.id);
				assert.ok(out[0].leg.amount < 0);
				assert.strictEqual(out[0].counterparts.length, 1);
				assert.strictEqual(out[0].counterparts[0].transaction.id, credit.id);
				assert.ok(out[0].counterparts[0].transaction.amount > 0);
				assert.strictEqual(out[0].counterparts[0].daysApart, 0);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The whole reason the shape changed (issue #91): three near-identical
		// rows were three readings of ONE decision.
		it.effect(
			"a debit matching several credits is one entry with several counterparts",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const debit = yield* repo.create(
						make({ amount: -30, accountId: asAccount(1), date: day(10) }),
					);
					const near = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2), date: day(11) }),
					);
					const far = yield* repo.create(
						make({ amount: 30, accountId: asAccount(3), date: day(14) }),
					);

					const out = yield* repo.transferCandidates();
					assert.strictEqual(out.length, 1);
					assert.strictEqual(out[0].leg.id, debit.id);
					// Closest-date first: the most likely match needs the least reading.
					assert.deepStrictEqual(
						out[0].counterparts.map((c) => [c.transaction.id, c.daysApart]),
						[
							[near.id, 1],
							[far.id, 4],
						],
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("reports the whole-day gap between the legs", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(make({ amount: -30, date: day(1) }));
				yield* repo.create(
					make({ amount: 30, accountId: asAccount(2), date: day(4) }),
				);

				const out = yield* repo.transferCandidates();
				assert.strictEqual(out.length, 1);
				assert.strictEqual(out[0].counterparts[0].daysApart, 3);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"excludes same-account, wrong-magnitude, and out-of-window rows",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const debit = yield* repo.create(
						make({ amount: -30, accountId: asAccount(1), date: day(6) }),
					);
					const match = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2), date: day(7) }),
					);
					// Same account — not a transfer.
					yield* repo.create(make({ amount: 30, accountId: asAccount(1) }));
					// Different magnitude.
					yield* repo.create(make({ amount: 31, accountId: asAccount(3) }));
					// Out of the ±5-day window (target on the 6th, this on the 12th).
					yield* repo.create(
						make({ amount: 30, accountId: asAccount(4), date: day(12) }),
					);

					const out = yield* repo.transferCandidates();
					assert.strictEqual(out.length, 1);
					assert.strictEqual(out[0].leg.id, debit.id);
					assert.deepStrictEqual(
						out[0].counterparts.map((c) => c.transaction.id),
						[match.id],
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		// Both legs are projected from their OWN issuer, exclusion included — the
		// same rule the list applies, so the Transfers page and the table cannot
		// disagree about whether a row counts (ADR 0008).
		it.effect("each leg derives exclusion through its own issuer", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (4, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				yield* repo.create(make({ amount: -30, issuerId: asIssuer(4) }));
				yield* repo.create(make({ amount: 30, accountId: asAccount(2) }));

				const out = yield* repo.transferCandidates();
				assert.strictEqual(out[0]?.leg.excludedFromRecap, true);
				// The credit leg has no issuer, so it keeps counting.
				assert.strictEqual(
					out[0]?.counterparts[0].transaction.excludedFromRecap,
					undefined,
				);
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);

		it.effect("excludes already-grouped and refund legs", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				// A grouped pair — must not resurface as a candidate.
				const g1 = yield* repo.create(make({ amount: -30 }));
				const g2 = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([g1.id, g2.id]);
				// A refund debit with a would-be credit counterpart.
				yield* repo.create(make({ amount: -40, isRefund: true }));
				yield* repo.create(make({ amount: 40, accountId: asAccount(3) }));

				const out = yield* repo.transferCandidates();
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("orders legs by their closest counterpart", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				// Pair A: 1 day apart. Pair B: 4 days apart.
				const aDebit = yield* repo.create(
					make({ amount: -30, accountId: asAccount(1), date: day(10) }),
				);
				const aCredit = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2), date: day(11) }),
				);
				const bDebit = yield* repo.create(
					make({ amount: -50, accountId: asAccount(1), date: day(1) }),
				);
				const bCredit = yield* repo.create(
					make({ amount: 50, accountId: asAccount(2), date: day(5) }),
				);

				const out = yield* repo.transferCandidates();
				assert.deepStrictEqual(
					out.map((c) => [c.leg.id, c.counterparts[0].transaction.id]),
					[
						[aDebit.id, aCredit.id],
						[bDebit.id, bCredit.id],
					],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("returns [] when nothing matches", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* repo.create(make({ amount: -30 }));
				const out = yield* repo.transferCandidates();
				assert.deepStrictEqual(out, []);
			}).pipe(Effect.provide(RepoTest)),
		);
	});

	// **Dismissed pairs** (issue #91) — the user's refusal, the one thing the
	// suggestion path persists. Detection stays live; a dismissal is what makes
	// clearing a coincidence permanent work rather than a chore repeated on every
	// read.
	describe("dismissTransferPairs", () => {
		const day = (n: number) =>
			new Date(`2026-03-${String(n).padStart(2, "0")}T00:00:00.000Z`);

		it.effect("a dismissed pair is absent from every later read", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(
					make({ amount: -30, accountId: asAccount(1) }),
				);
				const credit = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);

				const written = yield* repo.dismissTransferPairs([
					{ debitId: debit.id, creditId: credit.id },
				]);
				assert.deepStrictEqual(written, { count: 1 });
				assert.deepStrictEqual(yield* repo.transferCandidates(), []);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The scope rule: dismissal removes exactly the pairs it names, never more.
		it.effect("dismissing one pair leaves the leg's other pairs present", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(
					make({ amount: -30, accountId: asAccount(1), date: day(10) }),
				);
				const dismissed = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2), date: day(11) }),
				);
				const kept = yield* repo.create(
					make({ amount: 30, accountId: asAccount(3), date: day(12) }),
				);

				yield* repo.dismissTransferPairs([
					{ debitId: debit.id, creditId: dismissed.id },
				]);

				const out = yield* repo.transferCandidates();
				assert.strictEqual(out.length, 1);
				assert.deepStrictEqual(
					out[0].counterparts.map((c) => c.transaction.id),
					[kept.id],
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// A credit's panel clears that credit's pairs with each listed debit; the
		// debits' pairs with OTHER credits survive.
		it.effect(
			"dismissing one credit's pairs leaves another credit's alone",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const debitA = yield* repo.create(
						make({ amount: -30, accountId: asAccount(1), date: day(10) }),
					);
					const debitB = yield* repo.create(
						make({ amount: -30, accountId: asAccount(4), date: day(10) }),
					);
					const credit = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2), date: day(11) }),
					);
					const otherCredit = yield* repo.create(
						make({ amount: 30, accountId: asAccount(3), date: day(11) }),
					);

					// The credit's own panel showed two debits; refuse both.
					yield* repo.dismissTransferPairs([
						{ debitId: debitA.id, creditId: credit.id },
						{ debitId: debitB.id, creditId: credit.id },
					]);

					const out = yield* repo.transferCandidates();
					assert.deepStrictEqual(
						out.map((c) => [
							c.leg.id,
							c.counterparts.map((x) => x.transaction.id),
						]),
						[
							[debitA.id, [otherCredit.id]],
							[debitB.id, [otherCredit.id]],
						],
					);
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect(
			"is idempotent — re-dismissing a stored pair writes nothing",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					const debit = yield* repo.create(make({ amount: -30 }));
					const credit = yield* repo.create(
						make({ amount: 30, accountId: asAccount(2) }),
					);
					const pair = [{ debitId: debit.id, creditId: credit.id }];

					assert.deepStrictEqual(yield* repo.dismissTransferPairs(pair), {
						count: 1,
					});
					assert.deepStrictEqual(yield* repo.dismissTransferPairs(pair), {
						count: 0,
					});
				}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("an empty list writes nothing and is not an error", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				assert.deepStrictEqual(yield* repo.dismissTransferPairs([]), {
					count: 0,
				});
			}).pipe(Effect.provide(RepoTest)),
		);

		// The cascade, run explicitly in the shared post-delete cleanup: the schema
		// declares no foreign keys and never enables `PRAGMA foreign_keys`, so a
		// stored dismissal naming a deleted row would outlive it and silently
		// suppress a pairing between two rows that no longer exist — or, once the
		// id is reused, between two that never met.
		it.effect("deleting a leg deletes the dismissals naming it", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(make({ amount: -30 }));
				const credit = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				const other = yield* repo.create(
					make({ amount: -50, accountId: asAccount(1) }),
				);
				const otherCredit = yield* repo.create(
					make({ amount: 50, accountId: asAccount(2) }),
				);
				yield* repo.dismissTransferPairs([
					{ debitId: debit.id, creditId: credit.id },
					{ debitId: other.id, creditId: otherCredit.id },
				]);

				yield* repo.remove(credit.id);

				const left = yield* sql<{
					debitId: number;
					creditId: number;
				}>`SELECT debitId, creditId FROM transfer_dismissals`;
				assert.deepStrictEqual(
					left.map((r) => [r.debitId, r.creditId]),
					[[other.id, otherCredit.id]],
				);
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);

		it.effect("a bulk delete takes its rows' dismissals too", () =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				const debit = yield* repo.create(make({ amount: -30 }));
				const credit = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.dismissTransferPairs([
					{ debitId: debit.id, creditId: credit.id },
				]);

				yield* repo.bulkDelete([debit.id]);

				const left = yield* sql<{
					n: number;
				}>`SELECT COUNT(*) AS n FROM transfer_dismissals`;
				assert.strictEqual(left[0].n, 0);
			}).pipe(Effect.provide(RepoAndSqlTest)),
		);
	});

	// **Bundle / transfer-group exclusivity** (issue #75). The two groupings decide
	// how a row reaches the recap, and they decide it differently: a transfer leg
	// contributes nothing (its group nets to zero), a bundle member contributes
	// through its parent at a non-zero sum. A row holding both would be netted out
	// by the transfer partition while its parent still displayed its share — a
	// number that disagrees with itself. Both write paths refuse, in both
	// directions.
	describe("bundle / transfer exclusivity (issue #75)", () => {
		it.effect("refuses to bundle a transfer leg", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([a.id, b.id]);
				const c = yield* repo.create(make({ amount: -12 }));

				const error = yield* repo
					.createBundle([a.id, c.id], "Weekend")
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "is-transfer-leg" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("a refused bundle writes nothing (no parent, no stamping)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([a.id, b.id]);
				const c = yield* repo.create(make({ amount: -12 }));

				yield* repo.createBundle([a.id, c.id], "Weekend").pipe(Effect.flip);
				assert.strictEqual((yield* repo.getById(a.id)).bundleId, undefined);
				assert.strictEqual((yield* repo.getById(c.id)).bundleId, undefined);
				// Three rows: no parent was written.
				assert.strictEqual((yield* repo.list(listAll)).total, 3);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses to add a transfer leg to an existing bundle", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -5 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend");

				const leg = yield* repo.create(make({ amount: -30 }));
				const other = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				yield* repo.linkTransfer([leg.id, other.id]);

				const error = yield* repo
					.addBundleMember(parent.id, leg.id)
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new BundleInvalid({ reason: "is-transfer-leg" }),
				);
				// The parent still sums the two it had.
				assert.strictEqual((yield* repo.getById(parent.id)).amount, -25);
				assert.strictEqual((yield* repo.getById(leg.id)).bundleId, undefined);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("refuses to transfer-link a bundle member", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -30 }));
				const b = yield* repo.create(make({ amount: -5 }));
				yield* repo.createBundle([a.id, b.id], "Weekend");
				const counterpart = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);

				const error = yield* repo
					.linkTransfer([a.id, counterpart.id])
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "is-bundled" }),
				);
				// Nothing was stamped: the refusal is atomic like every other one.
				assert.strictEqual(
					(yield* repo.getById(counterpart.id)).transferGroupId,
					undefined,
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// A parent's amount is derived and moves with its members, so a zero-sum
		// group validated at write time could silently stop summing to zero.
		it.effect("refuses to transfer-link a bundle parent", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const a = yield* repo.create(make({ amount: -20 }));
				const b = yield* repo.create(make({ amount: -10 }));
				const parent = yield* repo.createBundle([a.id, b.id], "Weekend");
				const counterpart = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);

				const error = yield* repo
					.linkTransfer([parent.id, counterpart.id])
					.pipe(Effect.flip);
				assert.deepStrictEqual(
					error,
					new TransferInvalid({ reason: "is-bundled" }),
				);
			}).pipe(Effect.provide(RepoTest)),
		);

		// The suggestion side of the same rule: a pairing the user is offered must
		// be one `link-transfer` will accept, so a bundled row is never suggested —
		// neither as the target's counterpart nor as a detected pair.
		it.effect("never suggests a bundled counterpart", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: -30 }));
				const bundled = yield* repo.create(
					make({ amount: 30, accountId: asAccount(2) }),
				);
				const sibling = yield* repo.create(
					make({ amount: -5, accountId: asAccount(2) }),
				);
				yield* repo.createBundle([bundled.id, sibling.id], "Weekend");

				assert.deepStrictEqual(yield* repo.suggestTransfers(target.id), []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("returns [] for a bundled target (ineligible)", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				const target = yield* repo.create(make({ amount: -30 }));
				const sibling = yield* repo.create(make({ amount: -5 }));
				yield* repo.createBundle([target.id, sibling.id], "Weekend");
				// A would-be counterpart exists; the target is bundled, so it is moot.
				yield* repo.create(make({ amount: 30, accountId: asAccount(2) }));

				assert.deepStrictEqual(yield* repo.suggestTransfers(target.id), []);
			}).pipe(Effect.provide(RepoTest)),
		);

		it.effect("keeps bundled rows and parents out of the candidate pairs", () =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				// A -30 debit bundled with a small sibling, plus a matching +30 credit
				// in another account: a pair on amount alone, but the debit is bundled.
				const debit = yield* repo.create(make({ amount: -30 }));
				const sibling = yield* repo.create(make({ amount: -5 }));
				yield* repo.createBundle([debit.id, sibling.id], "Weekend");
				yield* repo.create(make({ amount: 30, accountId: asAccount(2) }));
				// And the parent itself (-35) against a +35 credit elsewhere.
				yield* repo.create(make({ amount: 35, accountId: asAccount(3) }));

				assert.deepStrictEqual(yield* repo.transferCandidates(), []);
			}).pipe(Effect.provide(RepoTest)),
		);
	});
});
