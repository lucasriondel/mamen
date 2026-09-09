import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Drops the stored half of the dead LLM settings surface (issue #116): the
 * `appSettings.llm` JSON blob, and the three loose `llm_endpoint` /
 * `llm_api_key` / `llm_model` rows in the key/value `settings` table.
 *
 * Nothing read either of them — they are a faithful port of a feature that no
 * longer exists — and `llm.apiKey` was a plain string `GET /app-settings` handed
 * back to any client that asked. **No value is migrated forward.** A key copied
 * into the credential store that replaces this would then live in two places,
 * one of which only looks live; a user with a key here pastes it once into the
 * new page when it exists.
 *
 * The `settings` rows are not merely tidy-up: `key` decodes through the
 * `SettingKey` literal union, which those three members just left, so a row left
 * behind would fail the decode of `GET /settings` on its own stored table.
 *
 * `appSettings.llm` carries no index (0007 indexes only `settings.key`), so a
 * plain `DROP COLUMN` (SQLite ≥ 3.35) suffices — the same shape as 0008 and 0017.
 * The singleton row itself survives, emptied down to its `id`.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.all([
    sql`DELETE FROM settings WHERE key IN ('llm_endpoint', 'llm_api_key', 'llm_model')`,
    sql`ALTER TABLE appSettings DROP COLUMN llm`,
  ]).pipe(Effect.asVoid),
);
