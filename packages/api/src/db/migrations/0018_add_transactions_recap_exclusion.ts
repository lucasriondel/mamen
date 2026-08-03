import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the two **recap exclusion** columns to `transactions` (issue #67,
 * [ADR 0008](../../../../../docs/adr/0008-recap-exclusion-is-derived-through-the-issuer.md)):
 *
 * - `excludedFromRecap` — the row does not count toward spend totals.
 * - `manualExcluded` — that exclusion state is a **deliberate** decision, so it
 *   wins over the default an issuer will carry once issuer-level exclusion lands
 *   (#69). It stands to `excludedFromRecap` exactly as `manualCategory` stands
 *   to `categoryId`, and is introduced here — in the slice *before* the one that
 *   needs it — so no later migration has to invent the distinction retroactively.
 *
 * Both are `INTEGER DEFAULT 0` like every other boolean column in this table, so
 * **nothing is backfilled**: every pre-existing row reads as not-excluded, which
 * is what it was. No index: exclusion becomes a `CASE` over the joined issuer in
 * #69, and a `CASE` in a `WHERE` cannot use one (ADR 0008).
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`ALTER TABLE transactions ADD COLUMN excludedFromRecap INTEGER DEFAULT 0`,
		sql`ALTER TABLE transactions ADD COLUMN manualExcluded INTEGER DEFAULT 0`,
	]).pipe(Effect.asVoid),
);
