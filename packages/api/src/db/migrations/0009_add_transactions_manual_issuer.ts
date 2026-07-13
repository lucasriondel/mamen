import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds the `transactions.manualIssuer` column (Matching Rules, PRD #8) — a
 * boolean 0/1 mirroring the existing `manualCategory`. It is set `true` only when
 * a human picks the issuer by hand; matching always writes `false`. Absent/`0`
 * means a Matching Rule may set or overwrite `issuerId`. Default `0` so every
 * pre-existing row is rule-eligible.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`ALTER TABLE transactions ADD COLUMN manualIssuer INTEGER DEFAULT 0`,
		sql`CREATE INDEX IF NOT EXISTS idx_tx_manualIssuer ON transactions(manualIssuer)`,
	]).pipe(Effect.asVoid),
);
