import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the `rules.matchValue` column (issue #42) — the optional **Value matcher**
 * (ADR 0004). A positive amount magnitude: when set, the rule matches a row only
 * if its `pattern` matches the raw issuer string **and** the row's amount
 * magnitude equals `matchValue` to the cent. `REAL` nullable, no default and no
 * backfill — every pre-existing row reads as a plain regex-only rule (absent →
 * SQL `NULL` → wire `matchValue` absent, folded like the transactions optionals).
 * No index: it is neither filtered nor ordered in SQL (the match runs in JS).
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	sql`ALTER TABLE rules ADD COLUMN matchValue REAL`.pipe(Effect.asVoid),
);
