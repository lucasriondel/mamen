import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds `transactions.rawSource` (issue #176, ADR 0012) — the **raw source**: the
 * original bank row exactly as the provider delivered it, so a column the parser
 * ignores today can be read tomorrow without re-importing the statement.
 *
 * `TEXT` holding a JSON object of the row's own column names to their string
 * values, following the storage pattern `anomalyFlags` set (migration 0004): the
 * row codec owns the parse/encode and the null-to-absent fold, so the column is
 * opaque to SQL and the handlers only ever see the object.
 *
 * Nullable with no default and **no backfill**. Every row imported before this
 * keeps null permanently — backfilling would require exactly the re-import this
 * work exists to make unnecessary — so null is a resting state rather than a
 * half-filled one. It stays that for a row with nothing to keep: one a user
 * typed by hand, and (until issue #189 gave the PDF path an archive of its own)
 * every PDF-extracted row.
 *
 * No index: nothing derives from the archive. It is read only when a single row
 * is displayed, never filtered, searched or joined on — that restraint is the
 * decision ADR 0012 records, and a column with an index on it is an invitation
 * to break it.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE transactions ADD COLUMN rawSource TEXT`.pipe(Effect.asVoid),
);
