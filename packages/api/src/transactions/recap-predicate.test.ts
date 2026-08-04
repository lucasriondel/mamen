import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import {
	AccountId,
	IssuerId,
	type TransactionCreate,
} from "@mamen/shared/contract";
import { Effect, Layer, Schema } from "effect";
import { DatabaseTest } from "../db/test";
import { recapPredicates } from "./recap-predicate";
import { TransactionRepo } from "./repository";

// The repository over a fresh `:memory:` DB, with the `SqlClient` kept in the
// output context — every case here runs the predicate through it directly.
const RepoAndSqlTest = TransactionRepo.Default.pipe(
	Layer.provideMerge(DatabaseTest),
);

const asAccount = Schema.decodeSync(AccountId);
const asIssuer = Schema.decodeSync(IssuerId);

const DATE = new Date("2026-07-15T12:00:00.000Z");

/** A spending row (a debit) dated in July 2026. */
const spent = (over: Partial<TransactionCreate> = {}): TransactionCreate => ({
	accountId: asAccount(1),
	date: DATE,
	amount: -10,
	rawIssuerString: "ACME STORE",
	importedAt: DATE,
	importMonth: "2026-07",
	...over,
});

/**
 * `countsTowardRecap` **on its own** (issue #80) — the predicate as the whole
 * WHERE, over the read shape it is written against, with none of the list's
 * other conditions around it.
 *
 * That is the point of this file. Every other test of the rule goes through
 * `repo.recap`, which builds `buildConditions` in front of the predicate — so a
 * clause the predicate does not state can still look enforced, because the list
 * default happens to enforce it. Here nothing else is in the query: what comes
 * back is exactly what the predicate says.
 */
const countedIds = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const { countsTowardRecap } = recapPredicates(sql);
	const rows = yield* sql<{
		id: number;
	}>`SELECT t.id FROM transactions t LEFT JOIN issuers i ON t.issuerId = i.id WHERE ${countsTowardRecap} ORDER BY t.id`;
	return rows.map((r) => Number(r.id));
});

describe("countsTowardRecap, run alone (issue #80)", () => {
	// The rule the predicate was documented as holding but never stated: a
	// **bundle member** is accounted for by its parent, so counting it as well
	// would show the same money twice.
	it.effect("excludes a bundle member", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const a = yield* repo.create(spent({ amount: -200 }));
			const b = yield* repo.create(spent({ amount: 150 }));
			yield* repo.createBundle([a.id, b.id], "Weekend away");

			const counted = yield* countedIds;
			assert.ok(!counted.includes(a.id), "the -200 member counts");
			assert.ok(!counted.includes(b.id), "the +150 member counts");
		}).pipe(Effect.provide(RepoAndSqlTest)),
	);

	// The mirror half, and the reason the clause is written on `bundleId` rather
	// than on `kind`: a parent carries no `bundleId`, so it is an ordinary row to
	// every clause — it counts, once, for the amount it stands for.
	it.effect("includes a bundle parent, like any ordinary row", () =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const a = yield* repo.create(spent({ amount: -200 }));
			const b = yield* repo.create(spent({ amount: 150 }));
			const parent = yield* repo.createBundle([a.id, b.id], "Weekend away");
			const ordinary = yield* repo.create(spent({ amount: -10 }));

			assert.deepStrictEqual(
				yield* countedIds,
				[parent.id, ordinary.id].sort((x, y) => x - y),
			);
		}).pipe(Effect.provide(RepoAndSqlTest)),
	);

	// The three clauses that were already stated, pinned the same way — so the
	// whole predicate is exercised by what it says, not by what the list adds.
	it.effect(
		"excludes transfer legs, excluded and duplicate-excluded rows",
		() =>
			Effect.gen(function* () {
				const sql = yield* SqlClient.SqlClient;
				const repo = yield* TransactionRepo;
				yield* sql`INSERT INTO issuers (id, name, excludedFromRecap, createdAt, firstSeen) VALUES (10, 'Joint account', 1, ${DATE.toISOString()}, ${DATE.toISOString()})`;
				const debit = yield* repo.create(spent({ amount: -30 }));
				const credit = yield* repo.create(spent({ amount: 30 }));
				yield* repo.linkTransfer([debit.id, credit.id]);
				// Excluded by its own flag, and by its issuer's default.
				yield* repo.create(
					spent({ amount: -50, excludedFromRecap: true, manualExcluded: true }),
				);
				yield* repo.create(spent({ amount: -70, issuerId: asIssuer(10) }));
				yield* repo.create(spent({ amount: -25, isDuplicateExcluded: true }));
				const ordinary = yield* repo.create(spent({ amount: -10 }));

				assert.deepStrictEqual(yield* countedIds, [ordinary.id]);
			}).pipe(Effect.provide(RepoAndSqlTest)),
	);
});
