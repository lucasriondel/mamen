import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Drops the `rules.categoryOverride` column (Matching Rules, PRD #8). A Matching
 * Rule assigns **only** an issuer — category is derived *through* the issuer at
 * query time, never copied onto the rule — so the column (an INTEGER category id
 * despite its name) is dead weight. No index referenced it (0005 indexes only
 * `issuerId`/`pattern`), so a plain `DROP COLUMN` (SQLite ≥ 3.35) suffices.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	sql`ALTER TABLE rules DROP COLUMN categoryOverride`.pipe(Effect.asVoid),
);
