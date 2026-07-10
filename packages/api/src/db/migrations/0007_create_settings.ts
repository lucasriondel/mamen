import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates the two settings tables, ported verbatim from the old server's initial
 * schema (`001-initial-schema.ts`). They stay **two separate resources**
 * (contract decision #2):
 *
 * - `settings` — a generic key/value store. `key` is `TEXT UNIQUE` (the upsert in
 *   `putByKey` keys off it); `value` is always TEXT (callers JSON-encode
 *   structured values themselves).
 * - `appSettings` — the typed singleton. `id` is a TEXT primary key (always
 *   `"app"`); `llm` is a JSON TEXT blob round-tripped by the repository codec.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.all([
		sql`
			CREATE TABLE IF NOT EXISTS settings (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				key TEXT NOT NULL UNIQUE,
				value TEXT NOT NULL
			)
		`,
		sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings(key)`,
		sql`
			CREATE TABLE IF NOT EXISTS appSettings (
				id TEXT PRIMARY KEY,
				llm TEXT NOT NULL
			)
		`,
	]).pipe(Effect.asVoid),
);
