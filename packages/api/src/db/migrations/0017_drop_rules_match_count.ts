import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Drops the `rules.matchCount` column (issue #63). It stored a *lifetime tally of
 * import-time wins*, bumped in one place only — the import matching pass — so a
 * rule written against existing history (the common case: you add a rule because
 * you just saw the rows it should claim) stayed at 0 forever, and a monotonic
 * counter could never fall when a row was deleted, hand-assigned away, or taken
 * by a more specific sibling rule.
 *
 * What the UI actually asks — *how many transactions does this rule own right
 * now* — is derived state, so it is now computed from the live table on read
 * (`RuleView.ownedCount`) rather than cached in a column. No index referenced it
 * (0005 indexes only `issuerId`/`pattern`), so a plain `DROP COLUMN` (SQLite ≥
 * 3.35) suffices; the tally itself is discarded, nothing read it.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE rules DROP COLUMN matchCount`.pipe(Effect.asVoid),
);
