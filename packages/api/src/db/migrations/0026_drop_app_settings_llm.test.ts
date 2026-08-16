import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest, databaseTestBefore } from "../test";
import migration0026 from "./0026_drop_app_settings_llm";

/**
 * The deletion of the dead LLM settings surface (issue #116) has a stored half:
 * the `appSettings.llm` JSON blob and the three loose `llm_*` rows in `settings`.
 * Both are dropped rather than migrated forward — a value copied into the
 * credential store that replaces this would live in two places, one of which
 * only looks live.
 *
 * The purge is asserted against the state a real database is actually in when
 * the migration runs — every migration up to 0025, with rows planted — because
 * over the full set there is nothing left to purge and an empty `DELETE` would
 * pass a test that asserts only the end state.
 */
const columnsOf = (table: string) =>
	Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient;
		const rows = yield* sql`SELECT * FROM pragma_table_info(${table})`;
		return (rows as unknown as Array<{ name: string }>).map((r) => r.name);
	});

const settingKeys = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const rows = yield* sql`SELECT key FROM settings ORDER BY key`;
	return (rows as unknown as Array<{ key: string }>).map((r) => r.key);
});

const Before0026 = databaseTestBefore("0026_drop_app_settings_llm");

describe("0026 drop the app-settings llm column", () => {
	it.effect("leaves the singleton with nothing but its id", () =>
		Effect.gen(function* () {
			assert.deepStrictEqual(yield* columnsOf("appSettings"), ["id"]);
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("drops a stored block, api key and all", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* sql`INSERT INTO appSettings ${sql.insert({
				id: "app",
				llm: JSON.stringify({
					endpoint: "https://api.anthropic.com",
					apiKey: "sk-secret",
					modelName: "claude-3",
					provider: "anthropic",
				}),
			})}`;

			yield* migration0026;

			assert.deepStrictEqual(yield* columnsOf("appSettings"), ["id"]);
			// The row survives — the singleton is not deleted, only emptied.
			const rows = yield* sql`SELECT id FROM appSettings`;
			assert.deepStrictEqual(rows as unknown as Array<{ id: string }>, [
				{ id: "app" },
			]);
		}).pipe(Effect.provide(Before0026)),
	);

	it.effect("purges the loose llm_* rows and keeps every other setting", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			for (const [key, value] of [
				["llm_endpoint", "http://localhost:11434"],
				["llm_api_key", "sk-secret"],
				["llm_model", "llama3"],
				["currency_symbol", "$"],
				["date_format", "dd/MM/yyyy"],
			]) {
				yield* sql`INSERT INTO settings ${sql.insert({ key, value })}`;
			}

			yield* migration0026;

			// A left-behind `llm_*` row is not inert: `key` decodes through the
			// `SettingKey` union, which no longer has these members, so `GET /settings`
			// would fail to decode its own table.
			assert.deepStrictEqual(yield* settingKeys, [
				"currency_symbol",
				"date_format",
			]);
		}).pipe(Effect.provide(Before0026)),
	);
});
