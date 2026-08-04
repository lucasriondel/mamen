import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";

/**
 * The index the **month filter** now needs (issue #87). The filter used to match
 * `importMonth`, served by `idx_tx_account_month`; it matches a range on `date`
 * instead, which that index cannot serve — so the equivalent one over
 * `(accountId, date)` has to exist and has to be the one sqlite reaches for.
 *
 * Asserted through `EXPLAIN QUERY PLAN` rather than by reading `sqlite_master`:
 * an index that exists but that the planner never picks is not an index the
 * filter is served by, which is the whole claim.
 */
describe("0023 transactions (accountId, date) index", () => {
	it.effect("plans an account + month-range scan through the index", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			// The shape `buildConditions` emits for `?accountId=1&importMonth=2026-03`.
			const plan = yield* sql<{
				detail: string;
			}>`EXPLAIN QUERY PLAN SELECT t.id FROM transactions t WHERE t.accountId = 1 AND t.date >= '2026-03-01' AND t.date < '2026-04-01'`;

			assert.include(
				plan.map((row) => row.detail).join("\n"),
				"idx_tx_account_date",
			);
		}).pipe(Effect.provide(DatabaseTest)),
	);
});
