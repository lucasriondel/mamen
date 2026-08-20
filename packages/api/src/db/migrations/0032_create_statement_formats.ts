import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates `statement_formats` (issue #183, PRD #180) — a **Statement Format**:
 * one user-authored record of how to read one bank's export, for one account.
 *
 * **Account-scoped, one-to-many, no foreign key.** `accountId` is a plain
 * INTEGER, consistent with this project having no DB-level referential
 * enforcement anywhere; the contract's branded id is the guard. Indexed, because
 * every read of this table is "the formats for the account I picked" — the
 * picker never wants the whole set.
 *
 * **`kind` is the discriminant**, `csv` or `pdf`, and `declaredColumns` is the
 * one column whose *meaning* it decides: for a CSV format it is the header
 * fingerprint a file must satisfy, for a PDF format it is the columns the
 * extraction prompt asks the model to return. One column rather than two
 * nullable ones because a format always declares exactly one such list, and a
 * schema with `headers` and `columns` side by side would let a row declare both
 * or neither. The wire shape keeps them apart — the contract is a union on
 * `kind` — which is where the split is worth seeing.
 *
 * **The nested objects are JSON in TEXT**, following the pattern `anomalyFlags`
 * set (migration 0004) and `rawSource` extends (0030): `mapping` (which column
 * becomes which transaction property) and `rules` (the sign strategy, date
 * order, decimal separator and optional row filter) are opaque to SQL, and the
 * **row codec** owns the parse/encode and the null-to-absent fold. They are
 * nested rather than flattened into a dozen columns because they are closed
 * unions: `debitColumn` is meaningless unless the sign strategy is
 * `debit-credit-columns`, and columns cannot say that.
 *
 * NOT NULL throughout. A format that names no mapping or no rules cannot be
 * applied to anything, so a row asserting one exists while holding neither is a
 * contradiction rather than a partially-filled draft — and drafts never reach
 * here, being persisted only in the action that commits an import.
 *
 * **No seed.** Green-Got is created by hand through the mapping UI, which makes
 * the feature's first real use an end-to-end test of it; a seeded row would also
 * need an `accountId` a migration cannot know.
 *
 * No uniqueness on the name or on `(accountId, kind)`: a bank publishing both a
 * CSV and a PDF export is ordinary, and a bank that changes its export earns a
 * *second* format rather than an edit — so that statements downloaded before the
 * change keep a format that reads them.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.all([
    sql`
			CREATE TABLE IF NOT EXISTS statement_formats (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				accountId INTEGER NOT NULL,
				name TEXT NOT NULL,
				kind TEXT NOT NULL,
				declaredColumns TEXT NOT NULL,
				mapping TEXT NOT NULL,
				rules TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			)
		`,
    sql`CREATE INDEX IF NOT EXISTS idx_statement_formats_accountId ON statement_formats(accountId)`,
  ]).pipe(Effect.asVoid),
);
