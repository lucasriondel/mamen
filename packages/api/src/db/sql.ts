import { BunContext } from "@effect/platform-bun";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect, Layer } from "effect";
import { DbPath } from "../config";
import { migrations } from "./migrations";

/**
 * The production sqlite client (Bun runtime), filename resolved from config.
 * App code depends only on the generic `SqlClient.SqlClient` tag this provides,
 * so the test layer can swap in `@effect/sql-sqlite-node` `:memory:` without
 * touching any repository. WAL is on by default.
 */
const SqlLive = Layer.unwrapEffect(
	Effect.map(DbPath, (filename) => SqliteClient.layer({ filename })),
);

/**
 * Runs the migration set when the layer is built (i.e. at server startup).
 * `BunContext.layer` satisfies the migrator's FileSystem/Path/CommandExecutor
 * requirement (its schema-dump path shells out to `sqlite3`).
 */
const MigratorLive = SqliteMigrator.layer({
	loader: SqliteMigrator.fromRecord(migrations),
}).pipe(Layer.provide(SqlLive), Layer.provide(BunContext.layer));

/** The full data layer: sqlite client + migrations applied. */
export const DatabaseLive = Layer.merge(SqlLive, MigratorLive);
