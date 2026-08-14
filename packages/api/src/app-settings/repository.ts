import { SqlClient, SqlSchema } from "@effect/sql";
import { AppSettings, LlmSettings, NotFound } from "@mamen/shared/contract";
import { Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored app-settings row: `id` is the fixed `"app"` primary key, `llm` is a
 * JSON TEXT blob. {@link AppSettingsFromRow} folds the JSON into the typed
 * `LlmSettings` so handlers only ever see the wire entity.
 */
const AppSettingsRow = Schema.Struct({
	id: Schema.Literal("app"),
	llm: Schema.String,
});

/**
 * The JSON codec for the `llm` TEXT column, over `LlmSettings`'s *encoded* shape
 * (dates as ISO strings, `provider` a plain string). Decoding yields that plain
 * object — exactly the shape `AppSettings` then decodes into the class — and
 * encoding stringifies it back. Using the encoded schema (not `LlmSettings`
 * itself) keeps this transform's `decode` returning `AppSettings`'s encoded side,
 * which is what `Schema.transform` into a class requires.
 */
const LlmJson = Schema.parseJson(Schema.encodedSchema(LlmSettings));

/**
 * `Schema.transform` maps the row's decoded type to `AppSettings`'s *encoded*
 * shape (string `id`, plain `llm` object); `AppSettings`'s own schema then decodes
 * that into the class (validating the `provider` literal, coercing
 * `lastTestedAt`). The JSON parse/stringify of `llm` lives here, so reads yield
 * the entity.
 *
 * Exported for the round-trip test: reads decode through it (via `SqlSchema`),
 * and the storage inverse (`encode`) is verified directly rather than left dead,
 * since the write path builds its row with the hand-written `put` below.
 */
export const AppSettingsFromRow = Schema.transform(
	AppSettingsRow,
	AppSettings,
	{
		strict: true,
		decode: (row) => ({
			id: row.id,
			llm: Schema.decodeSync(LlmJson)(row.llm),
		}),
		// `s` is the entity's *encoded* shape, so `llm` is already the plain JSON
		// object — JSON-stringify it directly for the TEXT column.
		encode: (s) => ({
			id: s.id,
			llm: Schema.encodeSync(LlmJson)(s.llm),
		}),
	},
);

/**
 * The app-settings repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client and
 * the `:memory:` sqlite-node test client. `get` 404s when the singleton row
 * doesn't exist yet; `put` is a whole-object upsert on the fixed id `"app"`
 * (`INSERT OR REPLACE`) that always succeeds — no error. The `llm` block is
 * round-tripped through the `llm` JSON TEXT column by {@link AppSettingsFromRow}.
 */
export class AppSettingsRepo extends Effect.Service<AppSettingsRepo>()(
	"api/AppSettingsRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const getQuery = SqlSchema.findOne({
				Request: Schema.Void,
				Result: AppSettingsFromRow,
				execute: () => sql`SELECT * FROM appSettings WHERE id = 'app'`,
			});

			// Whole-object upsert on the single fixed row. `Request: Schema.Any` because
			// the row is already a plain object (`llm` pre-stringified in `put`), not
			// something to decode — only the `Result` decode (RETURNING → entity)
			// matters. `RETURNING *` decodes back to the entity so the caller sees the
			// stored value.
			const putQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<{ id: "app"; llm: string }>,
				Result: AppSettingsFromRow,
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

			const put = (settings: AppSettings) =>
				putQuery({
					id: "app",
					// Encode the `LlmSettings` instance to its plain JSON shape (dates →
					// ISO strings), then stringify for the TEXT column.
					llm: JSON.stringify(Schema.encodeSync(LlmSettings)(settings.llm)),
				}).pipe(orDieSql);

			return { get, put } as const;
		}),
	},
) {}
