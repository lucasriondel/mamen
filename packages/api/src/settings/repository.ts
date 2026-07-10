import { SqlClient, SqlSchema } from "@effect/sql";
import {
	NotFound,
	Paged,
	Setting,
	type SettingKey,
} from "@mamen/shared/contract";
import { Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

const PagedSetting = Paged(Setting);

/** Number of rows in a `count(*)` result (used for the `list` total). */
const CountResult = Schema.Struct({ count: Schema.Number });

/**
 * The settings repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client and
 * the `:memory:` sqlite-node test client. `getByKey` 404s on an absent key;
 * `putByKey` is an **upsert on `key`** (`ON CONFLICT(key) DO UPDATE`) that always
 * succeeds — no `NotFound`, and no `Conflict` (an upsert never trips the unique
 * constraint). The caller-supplied `id` in the `putByKey` payload is ignored:
 * inserts get a fresh AUTOINCREMENT id, updates keep the existing row's id
 * (faithful to the old adapter, which keyed the upsert off `key` only).
 */
export class SettingRepo extends Effect.Service<SettingRepo>()(
	"api/SettingRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const listQuery = SqlSchema.findAll({
				Request: Schema.Struct({
					limit: Schema.Number,
					offset: Schema.Number,
				}),
				Result: Setting,
				execute: ({ limit, offset }) =>
					sql`SELECT * FROM settings ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
			});

			const countQuery = SqlSchema.single({
				Request: Schema.Void,
				Result: CountResult,
				execute: () => sql`SELECT COUNT(*) AS count FROM settings`,
			});

			const byKeyQuery = SqlSchema.findOne({
				Request: Setting.fields.key,
				Result: Setting,
				execute: (key) => sql`SELECT * FROM settings WHERE key = ${key}`,
			});

			// Upsert on the UNIQUE `key`: insert a fresh row, or overwrite the existing
			// row's `value` in place (its `id` is preserved). `RETURNING *` yields the
			// stored row — so the caller sees the real AUTOINCREMENT id, not the id
			// they sent (which is ignored). This is the only writer, hence no Conflict.
			const upsertQuery = SqlSchema.single({
				Request: Schema.Struct({
					key: Setting.fields.key,
					value: Schema.String,
				}),
				Result: Setting,
				execute: ({ key, value }) =>
					sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
						ON CONFLICT(key) DO UPDATE SET value = excluded.value
						RETURNING *`,
			});

			const list = (params: { limit: number; offset: number }) =>
				Effect.all({
					items: listQuery(params),
					total: countQuery(void 0).pipe(Effect.map((r) => r.count)),
				}).pipe(
					Effect.map((paged) => PagedSetting.make(paged)),
					orDieSql,
				);

			/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
			const requireOne = (
				found: Option.Option<Setting>,
				key: string,
			): Effect.Effect<Setting, NotFound> =>
				Option.match(found, {
					onNone: () =>
						Effect.fail(new NotFound({ resource: "setting", id: key })),
					onSome: Effect.succeed,
				});

			const getByKey = (key: SettingKey) =>
				byKeyQuery(key).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, key)),
				);

			const putByKey = (setting: Setting) =>
				upsertQuery({ key: setting.key, value: setting.value }).pipe(orDieSql);

			return { list, getByKey, putByKey } as const;
		}),
	},
) {}
