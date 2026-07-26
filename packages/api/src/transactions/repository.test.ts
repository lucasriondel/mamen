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
		assert.strictEqual(row.manualCategory, 0);
		assert.strictEqual(row.manualIssuer, 0);
		assert.strictEqual(row.anomalyFlags, null);
		assert.strictEqual(row.notes, null);
		assert.strictEqual(row.importBatchId, null);
		assert.deepStrictEqual(decode(row), bare);
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
			"deleteByAccountMonth auto-dissolves a group whose survivor is elsewhere",
			() =>
				Effect.gen(function* () {
					const repo = yield* TransactionRepo;
					// Legs in different accounts/months so deleting one account+month
					// removes exactly one leg, leaving the cross-account survivor.
					const a = yield* repo.create(
						make({ amount: -30, importMonth: "2026-03" }),
					);
					const b = yield* repo.create(
						make({
							amount: 30,
							accountId: asAccount(2),
							importMonth: "2026-04",
						}),
					);
					yield* repo.linkTransfer([a.id, b.id]);

					const result = yield* repo.deleteByAccountMonth(
						asAccount(1),
						"2026-03",
					);
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
});
