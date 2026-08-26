import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Widens `statement_formats.mapping.rawIssuerString` from one column name to a
 * **list** of them (PRD #208) — the backfill that lets rows written before the
 * list existed keep decoding.
 *
 * The contract's `ColumnMapping` now reads that field as `Schema.Array(String)`
 * because banks split a label across columns — a payee, a memo, a reference —
 * and a format that could name only one of them had to throw the rest away. The
 * stored value is JSON in TEXT, so the old shape does not fail at the column; it
 * fails at `MappingJson`, on the *read*, which would turn every format authored
 * before this into a 500 on the format picker rather than a visible upgrade.
 *
 * **A widening, not a rewrite.** `"Libelle"` becomes `["Libelle"]`, which is the
 * same format saying the same thing: one column joined with nothing is that
 * column. No format changes what it parses, which is what makes this safe to run
 * against statements already imported by the old shape.
 *
 * Written in TypeScript rather than as `json_set(…, json_array(…))` for the
 * reason 0033 gives: one definition of the target shape, and a row-at-a-time
 * pass costs nothing over a table that holds a handful of user-authored records.
 * A row whose value is already a list is left alone, so this is idempotent over
 * its own output and its test can re-apply it to a migrated database.
 *
 * A row whose `mapping` is not readable JSON is left untouched. This migration
 * is not the place to discover that, and failing here would take the whole
 * startup down over one unreadable row; the decode that follows still reports
 * it, at the read where it can be seen.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<{
    id: number;
    mapping: string;
  }>`SELECT id, mapping FROM statement_formats`;

  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.mapping);
    } catch {
      continue;
    }

    if (typeof parsed !== "object" || parsed === null) continue;
    const mapping = parsed as Record<string, unknown>;

    // Already a list — this migration re-applied, or a row written since.
    if (Array.isArray(mapping.rawIssuerString)) continue;
    if (typeof mapping.rawIssuerString !== "string") continue;

    // An empty name was never a valid stored mapping, but it costs nothing to
    // fold it to the empty list rather than to a list holding one blank column.
    const widened = mapping.rawIssuerString === "" ? [] : [mapping.rawIssuerString];
    const next = JSON.stringify({ ...mapping, rawIssuerString: widened });

    yield* sql`UPDATE statement_formats SET mapping = ${next} WHERE id = ${row.id}`;
  }
});
