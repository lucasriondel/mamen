import { SqlClient, SqlSchema } from "@effect/sql";
import { AppSettings, NotFound } from "@mamen/shared/contract";
import { Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * The app-settings repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client and
 * the `:memory:` sqlite-node test client. `get` 404s when the singleton row
 * doesn't exist yet; `put` is a whole-object upsert on the fixed id `"app"`
 * (`INSERT OR REPLACE`) that always succeeds — no error.
 *
 * Rows decode through the `AppSettings` entity itself: since migration 0026
 * dropped the `llm` JSON blob (issue #116) the stored row *is* the entity's
 * encoded shape, so there is no bespoke row transform to keep — the same reason
 * accounts, categories and settings have none.
 */
export class AppSettingsRepo extends Effect.Service<AppSettingsRepo>()(
	"api/AppSettingsRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const getQuery = SqlSchema.findOne({
				Request: Schema.Void,
				Result: AppSettings,
				execute: () => sql`SELECT * FROM appSettings WHERE id = 'app'`,
			});

			// Whole-object upsert on the single fixed row. `Request: Schema.Any` because
			// the row is already a plain object, not something to decode — only the
			// `Result` decode (RETURNING → entity) matters. `RETURNING *` decodes back
			// to the entity so the caller sees the stored value.
			const putQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<{ id: "app" }>,
				Result: AppSettings,
				execute: (row) =>
					sql`INSERT OR REPLACE INTO appSettings ${sql.insert(row)} RETURNING *`,
			});

			const get = () =>
				getQuery(void 0).pipe(
					orDieSql,
					Effect.flatMap((found) =>
						Option.match(found, {
							onNone: () =>
								Effect.fail(
									new NotFound({ resource: "appSettings", id: "app" }),
								),
							onSome: Effect.succeed,
						}),
					),
				);

			// `settings.id` is the literal `"app"` — the payload's only field, and the
			// fixed primary key of the one row this table ever holds.
			const put = (settings: AppSettings) =>
				putQuery({ id: settings.id }).pipe(orDieSql);

			return { get, put } as const;
		}),
	},
) {}
