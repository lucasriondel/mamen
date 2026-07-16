import {
	HttpApiBuilder,
	HttpApiClient,
	HttpClient,
	HttpClientRequest,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
	AccountId,
	AnomalyFlag,
	Api,
	CategoryId,
	CategoryNotLeaf,
	IssuerId,
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
const asIssuer = Schema.decodeSync(IssuerId);
const asTx = Schema.decodeSync(TransactionId);

const DATE = new Date("2026-03-01T00:00:00.000Z");

const make = (over: Partial<TransactionCreate> = {}): TransactionCreate => ({
	accountId: asAccount(1),
	date: DATE,
	amount: 42.5,
	rawIssuerString: "ACME STORE",
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
				payload: make({ amount: 12.34, rawIssuerString: "Coffee" }),
			});
			assert.strictEqual(created.amount, 12.34);
			assert.strictEqual(created.rawIssuerString, "Coffee");
			assert.strictEqual(created.issuerId, undefined);

			const fetched = yield* client.transactions.getById({
				path: { id: created.id },
			});
			assert.deepStrictEqual(fetched, created);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"anomalyFlags round-trip over the wire through the SDK client",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const flags = [
					new AnomalyFlag({
						type: "new-issuer",
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

	it.effect(
		"update applies a partial change and returns the full resource",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const created = yield* client.transactions.create({
					payload: make({ amount: 10 }),
				});
				const updated = yield* client.transactions.update({
					path: { id: created.id },
					// A seeded **leaf** (Groceries, id 2) — a folder is now rejected.
					payload: { amount: 20, categoryId: asCategory(2) },
				});
				assert.strictEqual(updated.amount, 20);
				assert.strictEqual(updated.categoryId, asCategory(2));
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
	// The category filter matches the DERIVED category (ADR 0002), so a stored
	// `categoryId` only counts when the row carries an override (`manualCategory`)
	// — these seed rows do, so `categoryId=7/8` still selects them. The
	// issuer-derived path (a non-manual row categorised through its issuer) is
	// covered by its own dedicated test below.
	const seed = (client: ApiClient) =>
		Effect.all([
			client.transactions.create({
				payload: make({
					accountId: asAccount(1),
					categoryId: asCategory(7),
					manualCategory: true,
					issuerId: asIssuer(2),
					date: new Date("2026-01-10T00:00:00.000Z"),
					importMonth: "2026-01",
					isRefund: true,
				}),
			}),
			client.transactions.create({
				payload: make({
					accountId: asAccount(1),
					categoryId: asCategory(8),
					manualCategory: true,
					date: new Date("2026-02-10T00:00:00.000Z"),
					importMonth: "2026-02",
				}),
			}),
			client.transactions.create({
				payload: make({
					accountId: asAccount(2),
					categoryId: asCategory(7),
					manualCategory: true,
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

// --- Bulk + targeted-delete endpoints (ticket AC) ---------------------------

describe("transactions bulk endpoints", () => {
	it.effect(
		"bulkCreate returns 201 with the created rows and generated ids",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const created = yield* client.transactions.bulkCreate({
					payload: {
						records: [
							make({ rawIssuerString: "A", amount: 1 }),
							make({ rawIssuerString: "B", amount: 2 }),
						],
					},
				});
				assert.strictEqual(created.length, 2);
				assert.deepStrictEqual(
					created.map((t) => t.rawIssuerString),
					["A", "B"],
				);
				// Ids are server-generated and distinct.
				assert.notStrictEqual(created[0]?.id, created[1]?.id);

				// Both are really persisted — visible through the list.
				const page = yield* client.transactions.list({
					urlParams: { limit: 50, offset: 0, direction: "desc" },
				});
				assert.strictEqual(page.total, 2);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("bulkCreate of an empty batch is a no-op → []", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.bulkCreate({
				payload: { records: [] },
			});
			assert.deepStrictEqual(created, []);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("bulkPut upserts by id and returns the affected count", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.create({
				payload: make({ amount: 10, rawIssuerString: "Before" }),
			});

			// One overwrite of the existing row, one insert of a brand-new id.
			const overwritten = {
				...created,
				amount: 99,
				rawIssuerString: "After",
			};
			const inserted = {
				...created,
				id: asTx(created.id + 1000),
				amount: 7,
				rawIssuerString: "New",
			};
			const result = yield* client.transactions.bulkPut({
				payload: { records: [overwritten, inserted] },
			});
			assert.strictEqual(result.count, 2);

			// The overwrite replaced the row (not a second insert at that id).
			const back = yield* client.transactions.getById({
				path: { id: created.id },
			});
			assert.strictEqual(back.amount, 99);
			assert.strictEqual(back.rawIssuerString, "After");

			// The insert created the new id verbatim.
			const fresh = yield* client.transactions.getById({
				path: { id: inserted.id },
			});
			assert.strictEqual(fresh.amount, 7);

			const all = yield* client.transactions.count({ urlParams: {} });
			assert.strictEqual(all.count, 2);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"bulkDelete returns the count actually deleted (partial existence)",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const a = yield* client.transactions.create({ payload: make() });
				const b = yield* client.transactions.create({ payload: make() });

				// Two real ids + one that never existed → only two are deleted.
				const result = yield* client.transactions.bulkDelete({
					payload: { ids: [a.id, b.id, asTx(999999)] },
				});
				assert.strictEqual(result.count, 2);

				const remaining = yield* client.transactions.count({ urlParams: {} });
				assert.strictEqual(remaining.count, 0);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("bulkDelete of an empty id list is a no-op → count 0", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.transactions.create({ payload: make() });
			const result = yield* client.transactions.bulkDelete({
				payload: { ids: [] },
			});
			assert.strictEqual(result.count, 0);
			const remaining = yield* client.transactions.count({ urlParams: {} });
			assert.strictEqual(remaining.count, 1);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("bulkGet returns only the ids that exist (partial existence)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const a = yield* client.transactions.create({
				payload: make({ rawIssuerString: "A" }),
			});
			const b = yield* client.transactions.create({
				payload: make({ rawIssuerString: "B" }),
			});

			const got = yield* client.transactions.bulkGet({
				payload: { ids: [a.id, asTx(888888), b.id] },
			});
			assert.strictEqual(got.length, 2);
			assert.deepStrictEqual(got.map((t) => t.rawIssuerString).sort(), [
				"A",
				"B",
			]);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("bulkGet of an empty id list → []", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const got = yield* client.transactions.bulkGet({ payload: { ids: [] } });
			assert.deepStrictEqual(got, []);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"deleteByAccountMonth deletes only the matching account+month",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// Two rows in acct 1 / 2026-03, one in acct 1 / 2026-04, one in acct 2.
				yield* client.transactions.create({
					payload: make({ accountId: asAccount(1), importMonth: "2026-03" }),
				});
				yield* client.transactions.create({
					payload: make({ accountId: asAccount(1), importMonth: "2026-03" }),
				});
				yield* client.transactions.create({
					payload: make({ accountId: asAccount(1), importMonth: "2026-04" }),
				});
				yield* client.transactions.create({
					payload: make({ accountId: asAccount(2), importMonth: "2026-03" }),
				});

				const result = yield* client.transactions.deleteByAccountMonth({
					urlParams: { accountId: asAccount(1), importMonth: "2026-03" },
				});
				assert.strictEqual(result.count, 2);

				const remaining = yield* client.transactions.count({ urlParams: {} });
				assert.strictEqual(remaining.count, 2);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"deleteByAccountMonth requires both query params (missing → 400)",
		() =>
			Effect.gen(function* () {
				const http = yield* HttpClient.HttpClient;
				// Only `accountId` sent — `importMonth` is required, so decode fails.
				const res = yield* http.execute(
					HttpClientRequest.del(
						"/api/transactions/by-account-month?accountId=1",
					),
				);
				assert.strictEqual(res.status, 400);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("deleteByImportBatch deletes only the matching batch", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.transactions.create({
				payload: make({ importBatchId: "batch-1" }),
			});
			yield* client.transactions.create({
				payload: make({ importBatchId: "batch-1" }),
			});
			yield* client.transactions.create({
				payload: make({ importBatchId: "batch-2" }),
			});

			const result = yield* client.transactions.deleteByImportBatch({
				path: { batchId: "batch-1" },
			});
			assert.strictEqual(result.count, 2);

			const remaining = yield* client.transactions.count({ urlParams: {} });
			assert.strictEqual(remaining.count, 1);
		}).pipe(Effect.provide(HttpLive)),
	);
});

// Import matching (Matching Rules, PRD #8) is driven end-to-end through the
// derived client: create rules, then `bulkCreate` a statement and assert the
// observable result — issuer assignments on the rows, `matchCount` bumps on the
// rules — never `IssuerMatcher` internals. This is the feature's single seam.
describe("import matching via bulkCreate", () => {
	it.effect("assigns the matching rule's issuer and bumps its matchCount", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const rule = yield* client.rules.create({
				payload: { issuerId: asIssuer(42), pattern: "AMAZON", matchCount: 0 },
			});

			const [row] = yield* client.transactions.bulkCreate({
				payload: { records: [make({ rawIssuerString: "AMAZON EU SARL" })] },
			});
			// The freshly-imported row enters the DB already resolved.
			assert.strictEqual(row?.issuerId, asIssuer(42));
			// The engine is stateless: the row records only that a rule set it.
			assert.strictEqual(row?.manualIssuer, undefined);

			// The win is booked on the rule.
			const bumped = yield* client.rules.getById({ path: { id: rule.id } });
			assert.strictEqual(bumped.matchCount, 1);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("leaves an unmatched row's issuer unset", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.rules.create({
				payload: { issuerId: asIssuer(1), pattern: "NETFLIX", matchCount: 0 },
			});
			const [row] = yield* client.transactions.bulkCreate({
				payload: { records: [make({ rawIssuerString: "SQ *BLUE BOTTLE" })] },
			});
			assert.strictEqual(row?.issuerId, undefined);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"matches case-insensitively (lowercase pattern, uppercase raw)",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				yield* client.rules.create({
					payload: { issuerId: asIssuer(7), pattern: "amazon", matchCount: 0 },
				});
				const [row] = yield* client.transactions.bulkCreate({
					payload: { records: [make({ rawIssuerString: "AMAZON EU SARL" })] },
				});
				assert.strictEqual(row?.issuerId, asIssuer(7));
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"the more-specific rule (longer literal) wins when several match one row",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// Broad rule → issuer 10; specific rule → issuer 20. The row matches both.
				const broad = yield* client.rules.create({
					payload: { issuerId: asIssuer(10), pattern: "AMAZON", matchCount: 0 },
				});
				const specific = yield* client.rules.create({
					payload: {
						issuerId: asIssuer(20),
						pattern: "AMAZON EU SARL",
						matchCount: 0,
					},
				});

				const [row] = yield* client.transactions.bulkCreate({
					payload: { records: [make({ rawIssuerString: "AMAZON EU SARL" })] },
				});
				assert.strictEqual(row?.issuerId, asIssuer(20));

				// Only the winner books the match; the broad rule is untouched.
				const specificAfter = yield* client.rules.getById({
					path: { id: specific.id },
				});
				const broadAfter = yield* client.rules.getById({
					path: { id: broad.id },
				});
				assert.strictEqual(specificAfter.matchCount, 1);
				assert.strictEqual(broadAfter.matchCount, 0);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("never overwrites a manually-assigned issuer", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const rule = yield* client.rules.create({
				payload: { issuerId: asIssuer(99), pattern: "AMAZON", matchCount: 0 },
			});
			// A manual row for the same raw string but a different issuer.
			const [row] = yield* client.transactions.bulkCreate({
				payload: {
					records: [
						make({
							rawIssuerString: "AMAZON EU SARL",
							issuerId: asIssuer(5),
							manualIssuer: true,
						}),
					],
				},
			});
			// Manual wins — the rule's issuer never lands.
			assert.strictEqual(row?.issuerId, asIssuer(5));
			assert.strictEqual(row?.manualIssuer, true);

			// And the rule books no win against it.
			const after = yield* client.rules.getById({ path: { id: rule.id } });
			assert.strictEqual(after.matchCount, 0);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"a hand-picked issuer (update sets manualIssuer) survives a later import matching pass",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const rule = yield* client.rules.create({
					payload: { issuerId: asIssuer(42), pattern: "AMAZON", matchCount: 0 },
				});

				// Import resolves the row against the rule; the engine records the
				// assignment as non-manual (manualIssuer written false, so absent).
				const [imported] = yield* client.transactions.bulkCreate({
					payload: { records: [make({ rawIssuerString: "AMAZON EU SARL" })] },
				});
				assert.strictEqual(imported?.issuerId, asIssuer(42));
				assert.strictEqual(imported?.manualIssuer, undefined);

				// A human overrides the issuer through the single-transaction
				// assignment flow (transaction `update`), which stamps manualIssuer.
				const assigned = yield* client.transactions.update({
					path: { id: imported.id },
					payload: { issuerId: asIssuer(5), manualIssuer: true },
				});
				assert.strictEqual(assigned.issuerId, asIssuer(5));
				assert.strictEqual(assigned.manualIssuer, true);

				// A later import runs the matcher again; the manual row is untouched —
				// same issuer, still flagged manual.
				yield* client.transactions.bulkCreate({
					payload: { records: [make({ rawIssuerString: "AMAZON FRESH" })] },
				});
				const after = yield* client.transactions.getById({
					path: { id: imported.id },
				});
				assert.strictEqual(after.issuerId, asIssuer(5));
				assert.strictEqual(after.manualIssuer, true);

				// The rule books one win per freshly-imported row it matches (both
				// imports), never a re-book against the manually-overridden row.
				const bumped = yield* client.rules.getById({ path: { id: rule.id } });
				assert.strictEqual(bumped.matchCount, 2);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"an invalid regex pattern is skipped, not a 500 — the import still succeeds",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// An unclosed character class — `new RegExp` throws on this.
				yield* client.rules.create({
					payload: { issuerId: asIssuer(1), pattern: "AMAZON[", matchCount: 0 },
				});
				// A valid rule that should still win its row.
				yield* client.rules.create({
					payload: { issuerId: asIssuer(2), pattern: "SPOTIFY", matchCount: 0 },
				});

				const rows = yield* client.transactions.bulkCreate({
					payload: {
						records: [
							make({ rawIssuerString: "AMAZON EU SARL" }),
							make({ rawIssuerString: "PAYPAL *SPOTIFY" }),
						],
					},
				});
				// No crash: the bad rule is skipped, the good rule still applies.
				assert.strictEqual(rows.length, 2);
				assert.strictEqual(rows[0]?.issuerId, undefined);
				assert.strictEqual(rows[1]?.issuerId, asIssuer(2));
			}).pipe(Effect.provide(HttpLive)),
	);
});

// Derived category (model A, PRD #8, issue #13): a transaction's category is
// read *through* its issuer's `defaultCategoryId` at query time — never copied
// onto the row — so re-categorising an issuer reclassifies its whole history at
// once, with no per-transaction writes. A manual category (`manualCategory`)
// wins over the issuer default and survives issuer operations. Asserted at the
// API boundary via the read endpoints (getById / list), the feature's seam.
describe("derived category through issuer", () => {
	const FIRST_SEEN = new Date("2026-01-15T00:00:00.000Z");

	it.effect(
		"a non-manual row reads its category through the issuer's defaultCategoryId",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "Amazon",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				// A row attached to that issuer, no manual category, no stored categoryId.
				const created = yield* client.transactions.create({
					payload: make({ issuerId: issuer.id }),
				});
				assert.strictEqual(created.categoryId, undefined);

				// Read derives the category through the issuer.
				const fetched = yield* client.transactions.getById({
					path: { id: created.id },
				});
				assert.strictEqual(fetched.categoryId, asCategory(7));

				// And through the list endpoint too.
				const page = yield* client.transactions.list({
					urlParams: { limit: 50, offset: 0, direction: "desc" },
				});
				assert.strictEqual(page.items[0]?.categoryId, asCategory(7));
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"recategorising the issuer reclassifies its whole history (no per-row writes)",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "Amazon",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				const a = yield* client.transactions.create({
					payload: make({ issuerId: issuer.id, rawIssuerString: "A" }),
				});
				const b = yield* client.transactions.create({
					payload: make({ issuerId: issuer.id, rawIssuerString: "B" }),
				});

				// Both derive the original category.
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: a.id } }))
						.categoryId,
					asCategory(7),
				);

				// Recategorise the issuer — a single issuer write, no transaction writes.
				yield* client.issuers.update({
					path: { id: issuer.id },
					payload: { defaultCategoryId: asCategory(9) },
				});

				// The whole history shifts on the next read.
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: a.id } }))
						.categoryId,
					asCategory(9),
				);
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: b.id } }))
						.categoryId,
					asCategory(9),
				);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"a manual category wins over the issuer default and survives recategorising",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "Amazon",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				// A hand-categorised row on that issuer.
				const manual = yield* client.transactions.create({
					payload: make({
						issuerId: issuer.id,
						categoryId: asCategory(3),
						manualCategory: true,
					}),
				});
				// Manual wins over the issuer default.
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: manual.id } }))
						.categoryId,
					asCategory(3),
				);

				// Recategorising the issuer must not touch the manual row.
				yield* client.issuers.update({
					path: { id: issuer.id },
					payload: { defaultCategoryId: asCategory(9) },
				});
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: manual.id } }))
						.categoryId,
					asCategory(3),
				);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("a row with no issuer derives no category (non-manual)", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.create({
				payload: make({ categoryId: asCategory(2) }),
			});
			// Stored categoryId is ignored on read for a non-manual, issuer-less row —
			// category exists only *through* an issuer (model A).
			const fetched = yield* client.transactions.getById({
				path: { id: created.id },
			});
			assert.strictEqual(fetched.categoryId, undefined);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"clearing the issuer default unassigns its non-manual transactions",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "Amazon",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				const created = yield* client.transactions.create({
					payload: make({ issuerId: issuer.id }),
				});
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: created.id } }))
						.categoryId,
					asCategory(7),
				);

				// Clear the issuer default (a `null` update) → the row reads Unassigned.
				yield* client.issuers.update({
					path: { id: issuer.id },
					payload: { defaultCategoryId: null },
				});
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: created.id } }))
						.categoryId,
					undefined,
				);
			}).pipe(Effect.provide(HttpLive)),
	);

	// The Category override lifecycle (issue #23): an override wins over the
	// issuer default, and removing it — clearing `manualCategory` — reverts the
	// row to that default, never to no category.
	it.effect(
		"removing an override (manualCategory → false) reverts to the issuer default",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "Amazon",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				// A hand-picked override to a *different* leaf than the issuer default.
				const tx = yield* client.transactions.create({
					payload: make({
						issuerId: issuer.id,
						categoryId: asCategory(3),
						manualCategory: true,
					}),
				});
				// The override wins over the issuer's default.
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: tx.id } }))
						.categoryId,
					asCategory(3),
				);

				// Remove the override: clear the manual flag. The row reverts to the
				// issuer default (asCategory(7)), never to Unassigned.
				yield* client.transactions.update({
					path: { id: tx.id },
					payload: { manualCategory: false },
				});
				assert.strictEqual(
					(yield* client.transactions.getById({ path: { id: tx.id } }))
						.categoryId,
					asCategory(7),
				);
			}).pipe(Effect.provide(HttpLive)),
	);
});

// The Leaf-assignable invariant (ADR 0003) at the transactions door: a
// `categoryId` must be an assignable **leaf** (a node with no children), never a
// **folder** — the same corruption the issuer door already rejects, arriving
// through a different door. Assignability is childlessness, not root-ness. The
// seed provides both: folder ids (1 = Food, which has children) and leaf ids
// (2 = Groceries, childless under Food).
describe("category leaf-assignable invariant at the transactions door", () => {
	const FOLDER = asCategory(1); // Food — a seeded node with children.
	const LEAF = asCategory(2); // Groceries — a seeded childless leaf under Food.

	it.effect("create rejects a folder as categoryId", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.transactions
				.create({ payload: make({ categoryId: FOLDER }) })
				.pipe(Effect.flip);
			assert.ok(error instanceof CategoryNotLeaf);
			assert.strictEqual(error.categoryId, FOLDER);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("create accepts a leaf as a manual categoryId", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.create({
				payload: make({ categoryId: LEAF, manualCategory: true }),
			});
			assert.strictEqual(
				(yield* client.transactions.getById({ path: { id: created.id } }))
					.categoryId,
				LEAF,
			);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("update rejects a folder as categoryId", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const created = yield* client.transactions.create({ payload: make() });
			const error = yield* client.transactions
				.update({
					path: { id: created.id },
					payload: { categoryId: FOLDER, manualCategory: true },
				})
				.pipe(Effect.flip);
			assert.ok(error instanceof CategoryNotLeaf);
			assert.strictEqual(error.categoryId, FOLDER);
		}).pipe(Effect.provide(HttpLive)),
	);

	it.effect("bulkCreate rejects a folder in any row, writing nothing", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.transactions
				.bulkCreate({
					payload: {
						records: [
							make({
								rawIssuerString: "A",
								categoryId: LEAF,
								manualCategory: true,
							}),
							make({ rawIssuerString: "B", categoryId: FOLDER }),
						],
					},
				})
				.pipe(Effect.flip);
			assert.ok(error instanceof CategoryNotLeaf);
			assert.strictEqual(error.categoryId, FOLDER);
			// The batch is rejected up front, before a single row is written.
			const page = yield* client.transactions.list({
				urlParams: { limit: 50, offset: 0, direction: "desc" },
			});
			assert.strictEqual(page.total, 0);
		}).pipe(Effect.provide(HttpLive)),
	);

	// The heart of ADR 0003: a hand-built depth-3 tree. The deepest node is a
	// childless leaf (assignable at any depth), while its mid-tier parent — which
	// has both a parent and a child — must be refused. Under the old `parentId ===
	// null` proxy that mid-tier node would have silently passed as assignable.
	it.effect("accepts a depth-3 leaf, rejects its mid-tier parent", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const category = (
				slug: string,
				parentId: typeof CategoryId.Type | null,
			) =>
				client.categories.create({
					payload: {
						name: slug,
						slug,
						color: "#000000",
						icon: "📁",
						parentId,
						sortOrder: 0,
					},
				});

			// Life > Subscriptions > Streaming (three deep, deliberately ragged).
			const life = yield* category("life-3", null);
			const subscriptions = yield* category("subs-3", life.id);
			const streaming = yield* category("streaming-3", subscriptions.id);

			// The depth-3 childless leaf is assignable.
			const created = yield* client.transactions.create({
				payload: make({ categoryId: streaming.id, manualCategory: true }),
			});
			assert.strictEqual(
				(yield* client.transactions.getById({ path: { id: created.id } }))
					.categoryId,
				streaming.id,
			);

			// The mid-tier node (Subscriptions) now has a child — refused, even
			// though it also has a parent (the old proxy would have let it through).
			const error = yield* client.transactions
				.create({
					payload: make({
						rawIssuerString: "MID",
						categoryId: subscriptions.id,
						manualCategory: true,
					}),
				})
				.pipe(Effect.flip);
			assert.ok(error instanceof CategoryNotLeaf);
			assert.strictEqual(error.categoryId, subscriptions.id);
		}).pipe(Effect.provide(HttpLive)),
	);
});

// The category page's engine (issue #25, ADR 0002): the transactions filter
// matches the DERIVED category — the same `CASE` the list returns — not the
// stored column, and its count response carries a signed net total. The count
// query gains the issuer join it lacked, so the count and the list can never
// disagree. `categoryId` also accepts a set, so a folder page fetches its
// leaves' transactions in one query. Leaf ids 7/8/9 sit under folder 5 (Home).
describe("category filter matches the derived category (ADR 0002)", () => {
	const FIRST_SEEN = new Date("2026-01-15T00:00:00.000Z");

	// The regression this whole slice exists to fix, and the highest-value test
	// in #19: a transaction categorised THROUGH its issuer (no override) must
	// appear when filtering by that category. Before ADR 0002 the filter matched
	// the stored column and silently omitted every issuer-categorised row — the
	// common case — so the page showed a near-empty list while looking fine.
	it.effect(
		"an issuer-categorised (non-manual) transaction appears when filtering by its category",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "EDF",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				// Non-manual, no stored categoryId — categorised only through the issuer.
				const tx = yield* client.transactions.create({
					payload: make({ issuerId: issuer.id }),
				});
				assert.strictEqual(tx.categoryId, undefined);

				const page = yield* client.transactions.list({
					urlParams: {
						limit: 50,
						offset: 0,
						direction: "desc",
						categoryId: asCategory(7),
					},
				});
				assert.strictEqual(page.total, 1);
				assert.strictEqual(page.items[0]?.id, tx.id);

				// The count endpoint shares the same join + derivation, so it agrees.
				const counted = yield* client.transactions.count({
					urlParams: { categoryId: asCategory(7) },
				});
				assert.strictEqual(counted.count, 1);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"the category filter accepts a set — a folder's leaves in one query",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				// Two issuers defaulting to two different leaves under the same folder,
				// plus a third leaf that must stay out of the set.
				const energy = yield* client.issuers.create({
					payload: {
						name: "EDF",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				const insurer = yield* client.issuers.create({
					payload: {
						name: "AXA",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(8),
					},
				});
				const netco = yield* client.issuers.create({
					payload: {
						name: "Free",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(9),
					},
				});
				yield* client.transactions.create({
					payload: make({ issuerId: energy.id, rawIssuerString: "A" }),
				});
				yield* client.transactions.create({
					payload: make({ issuerId: insurer.id, rawIssuerString: "B" }),
				});
				yield* client.transactions.create({
					payload: make({ issuerId: netco.id, rawIssuerString: "C" }),
				});

				const page = yield* client.transactions.list({
					urlParams: {
						limit: 50,
						offset: 0,
						direction: "desc",
						categoryId: [asCategory(7), asCategory(8)],
					},
				});
				assert.strictEqual(page.total, 2);

				const counted = yield* client.transactions.count({
					urlParams: { categoryId: [asCategory(7), asCategory(8)] },
				});
				assert.strictEqual(counted.count, 2);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"the count total is signed and net over the whole filtered set",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "EDF",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				// A purchase and its refund under the same category net to zero…
				yield* client.transactions.create({
					payload: make({ issuerId: issuer.id, amount: -80 }),
				});
				yield* client.transactions.create({
					payload: make({ issuerId: issuer.id, amount: 80, isRefund: true }),
				});
				// …a third, unrefunded purchase leaves a signed net behind.
				yield* client.transactions.create({
					payload: make({ issuerId: issuer.id, amount: -30 }),
				});

				const counted = yield* client.transactions.count({
					urlParams: { categoryId: asCategory(7) },
				});
				assert.strictEqual(counted.count, 3);
				assert.strictEqual(counted.total, -30);
			}).pipe(Effect.provide(HttpLive)),
	);

	it.effect(
		"the total follows the account filter and covers the whole set, not the page",
		() =>
			Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const issuer = yield* client.issuers.create({
					payload: {
						name: "EDF",
						firstSeen: FIRST_SEEN,
						defaultCategoryId: asCategory(7),
					},
				});
				// Three rows in account 1 and one in account 2, all category 7.
				yield* client.transactions.create({
					payload: make({
						accountId: asAccount(1),
						issuerId: issuer.id,
						amount: 10,
					}),
				});
				yield* client.transactions.create({
					payload: make({
						accountId: asAccount(1),
						issuerId: issuer.id,
						amount: 10,
					}),
				});
				yield* client.transactions.create({
					payload: make({
						accountId: asAccount(1),
						issuerId: issuer.id,
						amount: 10,
					}),
				});
				yield* client.transactions.create({
					payload: make({
						accountId: asAccount(2),
						issuerId: issuer.id,
						amount: 5,
					}),
				});

				// The account filter narrows the total (it follows the view's filters).
				const acct1 = yield* client.transactions.count({
					urlParams: { categoryId: asCategory(7), accountId: asAccount(1) },
				});
				assert.strictEqual(acct1.count, 3);
				assert.strictEqual(acct1.total, 30);

				// A one-row page understates nothing: the list pages, the total does not.
				const page = yield* client.transactions.list({
					urlParams: {
						limit: 1,
						offset: 0,
						direction: "desc",
						categoryId: asCategory(7),
						accountId: asAccount(1),
					},
				});
				assert.strictEqual(page.items.length, 1);
				assert.strictEqual(page.total, 3);
			}).pipe(Effect.provide(HttpLive)),
	);
});
