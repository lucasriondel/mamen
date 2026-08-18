import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { DatabaseRepo } from "../database/repository";
import { DatabaseTest } from "../db/test";
import { derive } from "../matching/issuer-matcher";
import { TransactionRepo } from "../transactions/repository";
import { buildDemoDataset } from "./dataset";
import { DemoSeedFailure, seedDemo } from "./seed";

/**
 * The seeder over a fresh `:memory:` database — the same migration set the
 * production layer runs, so "seeds from empty, running migrations itself" is
 * what these tests actually exercise (issue #139).
 *
 * The dataset's own shape is pinned in `dataset.test.ts`; what is asserted here
 * is what the *app* makes of it once written: the recap's breakdowns, the
 * transfer line, the bundle, the month grid, and the Issuer invariant holding
 * against a re-derivation.
 */
const SeedTest = Layer.mergeAll(
	TransactionRepo.Default,
	DatabaseRepo.Default,
).pipe(Layer.provideMerge(DatabaseTest));

const data = buildDemoDataset();

/** A month as the recap's inclusive bounds on the transaction's own date. */
const monthBounds = (month: string) => ({
	startDate: new Date(`${month}-01T00:00:00.000Z`),
	endDate: new Date(`${month}-31T23:59:59.999Z`),
});

const bucketsById = <B extends { id: number | null }>(
	buckets: ReadonlyArray<B>,
) => new Map(buckets.map((b) => [b.id, b]));

describe("seedDemo", () => {
	it.effect("fills an empty database from its migrations alone", () =>
		Effect.gen(function* () {
			const summary = yield* seedDemo;

			assert.deepStrictEqual(summary, {
				accounts: data.accounts.length,
				issuers: data.issuers.length,
				rules: data.rules.length,
				transactions: data.transactions.length,
				subscriptions: data.subscriptions.length,
			});

			const dump = yield* DatabaseRepo.pipe(
				Effect.flatMap((repo) => repo.exportAll()),
			);
			assert.strictEqual(dump.accounts.length, data.accounts.length);
			assert.strictEqual(dump.transactions.length, data.transactions.length);
			// The category tree the migration planted is left where it is.
			assert.isAbove(dump.categories.length, 20);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("writes the same database when it is run again", () =>
		Effect.gen(function* () {
			const repo = yield* DatabaseRepo;
			yield* seedDemo;
			const first = yield* repo.exportAll();
			yield* seedDemo;
			const second = yield* repo.exportAll();

			assert.deepStrictEqual(second, first);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("pins the seeded category tree's timestamps too", () =>
		Effect.gen(function* () {
			// The tree is planted by a migration that stamps it with `new Date()`, so
			// two fresh seeds would otherwise differ in a column nothing displays —
			// and a demo database is an artefact that gets diffed and published.
			const sql = yield* SqlClient.SqlClient;
			yield* seedDemo;
			const rows = yield* sql<{
				createdAt: string;
			}>`SELECT DISTINCT createdAt FROM categories`;

			assert.strictEqual(rows.length, 1);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("gives every issuer a childless leaf as its default category", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* seedDemo;

			const folders = yield* sql<{
				id: number;
			}>`SELECT DISTINCT parentId AS id FROM categories WHERE parentId IS NOT NULL`;
			const parents = new Set(folders.map((f) => f.id));

			const issuers = yield* sql<{
				name: string;
				defaultCategoryId: number | null;
			}>`SELECT name, defaultCategoryId FROM issuers`;

			assert.isAbove(issuers.length, 0);
			for (const issuer of issuers) {
				assert.isNotNull(issuer.defaultCategoryId, issuer.name);
				assert.isFalse(
					parents.has(issuer.defaultCategoryId ?? -1),
					issuer.name,
				);
			}
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("refuses, writing nothing, when a category it needs is gone", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* sql`DELETE FROM categories WHERE slug IN ('cafes', 'rent')`;

			const failure = yield* seedDemo.pipe(Effect.flip);
			assert.instanceOf(failure, DemoSeedFailure);
			assert.deepStrictEqual([...failure.missingCategories].sort(), [
				"cafes",
				"rent",
			]);

			const rows = yield* sql<{
				count: number;
			}>`SELECT COUNT(*) AS count FROM transactions`;
			assert.strictEqual(rows[0].count, 0);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect(
		"breaks spend down by issuer and by category, month after month",
		() =>
			Effect.gen(function* () {
				const repo = yield* TransactionRepo;
				yield* seedDemo;

				const periods = yield* repo.recapPeriods();
				assert.deepStrictEqual(periods.months, [
					"2026-06",
					"2026-05",
					"2026-04",
					"2026-03",
					"2026-02",
					"2026-01",
				]);

				const january = yield* repo.recap(monthBounds("2026-01"));
				const june = yield* repo.recap(monthBounds("2026-06"));

				for (const recap of [january, june]) {
					assert.isAtLeast(recap.byIssuer.length, 8);
					assert.isAtLeast(recap.byCategory.length, 6);
					// Unattributed spend is a bucket of its own, not a dropped row.
					assert.isTrue(recap.byIssuer.some((b) => b.id === null));
					for (const bucket of recap.byIssuer) assert.isAbove(bucket.spent, 0);
				}

				// The energy bill falls through the spring, so two periods are not the
				// same period twice.
				const spent = (recap: typeof january) =>
					recap.byIssuer.reduce((sum, b) => sum + b.spent, 0);
				assert.notStrictEqual(spent(january), spent(june));
			}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("reports the confirmed transfer as a transfer, not as spend", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			yield* seedDemo;

			const march = yield* repo.recap(monthBounds("2026-03"));

			// 250 € moved: the debit leg's magnitude, counted once, over both legs.
			assert.deepStrictEqual(march.transfers, { total: 250, count: 2 });

			const legs = yield* repo.list({
				isTransferLeg: true,
				limit: 100,
				offset: 0,
				direction: "asc",
			});
			assert.strictEqual(legs.total, 12);

			// Their issuer therefore reaches no spend bucket at all.
			const internal = data.issuers.find((i) => i.name === "Virement interne");
			assert.isUndefined(bucketsById(march.byIssuer).get(internal?.id ?? -1));
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("leaves one pair for the Transfers page to confirm", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			yield* seedDemo;

			const candidates = yield* repo.transferCandidates();
			// One decision to make: the debit leg, and the single credit it could be.
			assert.strictEqual(candidates.length, 1);
			assert.strictEqual(candidates[0].leg.amount, -180);
			assert.strictEqual(candidates[0].counterparts.length, 1);
			assert.strictEqual(candidates[0].counterparts[0].transaction.amount, 180);
			assert.strictEqual(candidates[0].counterparts[0].daysApart, 1);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("treats the bundle as one operation", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			yield* seedDemo;

			const parents = yield* repo.list({
				kind: "bundle",
				limit: 10,
				offset: 0,
				direction: "asc",
			});
			assert.strictEqual(parents.total, 1);
			const parent = parents.items[0];
			assert.strictEqual(parent.amount, -140.5);

			const members = yield* repo.list({
				bundleId: parent.id,
				limit: 10,
				offset: 0,
				direction: "asc",
			});
			assert.strictEqual(members.total, 3);
			assert.strictEqual(
				members.items.reduce((sum, m) => sum + Math.round(m.amount * 100), 0),
				Math.round(parent.amount * 100),
			);

			// The unfiltered table shows the parent and hides what it stands for, so
			// the same money is never listed twice.
			const page = yield* repo.list({
				limit: 500,
				offset: 0,
				direction: "asc",
			});
			assert.strictEqual(page.total, data.transactions.length - 3);
			assert.isTrue(page.items.some((t) => t.id === parent.id));
			assert.isFalse(page.items.some((t) => t.bundleId !== undefined));
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect(
		"fills the Accounts month grid, every account and every month",
		() =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				yield* seedDemo;

				const cells = yield* sql<{
					accountId: number;
					importMonth: string;
				}>`SELECT DISTINCT accountId, importMonth FROM transactions ORDER BY accountId, importMonth`;

				assert.strictEqual(cells.length, 18);
				assert.deepStrictEqual(cells[0], {
					accountId: 1,
					importMonth: "2026-01",
				});
			}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("holds every rule to the issuer its rows already carry", () =>
		Effect.gen(function* () {
			const repo = yield* DatabaseRepo;
			yield* seedDemo;
			const dump = yield* repo.exportAll();

			// The **Issuer invariant**: re-deriving the whole table against the whole
			// rule set moves nothing. A seeded row whose issuer no rule would give it
			// is a demo that changes the moment a user opens the Rules page.
			const { outcomes, skippedRuleIds } = derive(
				dump.transactions,
				dump.rules,
			);
			assert.deepStrictEqual(skippedRuleIds, []);

			const stored = new Map(dump.transactions.map((t) => [t.id, t]));
			const moved = outcomes.filter(
				(o) => (stored.get(o.transactionId)?.issuerId ?? null) !== o.issuerId,
			);
			assert.deepStrictEqual(moved, []);

			// And the rules are doing the work: only the hand-assigned row and the
			// deliberately unassigned ones have no rule behind them.
			const ruleless = outcomes.filter((o) => o.matchedRuleId === null);
			assert.isBelow(ruleless.length, 15);
			assert.isAbove(outcomes.length - ruleless.length, 100);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("keeps the hand-assigned row hand-assigned", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			yield* seedDemo;

			const manual = yield* repo.list({
				search: "4907 62110",
				limit: 10,
				offset: 0,
				direction: "asc",
			});
			assert.strictEqual(manual.total, 1);
			assert.isTrue(manual.items[0].manualIssuer);
			assert.isDefined(manual.items[0].issuerId);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("holds spend out of the recap by hand and through an issuer", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			yield* seedDemo;

			// February carries the hand-excluded dinner; every month may carry a
			// Kolibri row, excluded through its issuer.
			const february = yield* repo.recap(monthBounds("2026-02"));
			assert.isAtLeast(february.excluded.count, 1);
			assert.isAtLeast(february.excluded.total, 132);

			const excludedRows = yield* repo.list({
				excludedFromRecap: true,
				limit: 100,
				offset: 0,
				direction: "asc",
			});
			assert.isAtLeast(excludedRows.total, 3);
		}).pipe(Effect.provide(SeedTest)),
	);

	it.effect("names, in every subscription, charges that are really there", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* seedDemo;

			const subs = yield* sql<{
				issuerId: number;
				transactionIds: string;
				chargeCount: number;
			}>`SELECT issuerId, transactionIds, chargeCount FROM subscriptions`;
			assert.strictEqual(subs.length, data.subscriptions.length);

			for (const sub of subs) {
				const ids = JSON.parse(sub.transactionIds) as Array<number>;
				assert.strictEqual(ids.length, sub.chargeCount);

				const rows = yield* sql<{
					count: number;
				}>`SELECT COUNT(*) AS count FROM transactions WHERE issuerId = ${sub.issuerId} AND id IN ${sql.in(ids)}`;
				assert.strictEqual(rows[0].count, ids.length);
			}
		}).pipe(Effect.provide(SeedTest)),
	);
});
