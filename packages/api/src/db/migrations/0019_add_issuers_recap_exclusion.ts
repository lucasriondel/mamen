import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds `issuers.excludedFromRecap` — the **bulk** recap-exclusion lever (issue
 * #69,
 * [ADR 0008](../../../../../docs/adr/0008-recap-exclusion-is-derived-through-the-issuer.md)):
 * every transaction of this issuer is held out of spend totals *by default*.
 *
 * `INTEGER DEFAULT 0` like every other boolean column, so **nothing is
 * backfilled**: existing issuers read as counted, which is what they were. It
 * is the counterpart of the two transaction columns from migration 0018 —
 * together they make the derivation `CASE WHEN t.manualExcluded = 1 THEN
 * t.excludedFromRecap ELSE i.excludedFromRecap END` readable in one join.
 *
 * No index: the derivation is a `CASE` over the joined issuer and a `CASE` in a
 * `WHERE` cannot use one (ADR 0008). No re-derivation pass either — that is the
 * point of deriving rather than stamping: flipping this column reclassifies the
 * issuer's whole non-overridden history at once, and its future imports with it.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	sql`ALTER TABLE issuers ADD COLUMN excludedFromRecap INTEGER DEFAULT 0`.pipe(
		Effect.asVoid,
	),
);
