import { NodeContext } from "@effect/platform-node";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { Layer } from "effect";
import { migrations } from "./migrations";

/**
 * The `:memory:` test data layer — the reusable helper every DB-backed port's
 * tests build on (settles the map's open "sqlite `:memory:` test-layer wiring").
 *
 * Uses `@effect/sql-sqlite-node`, not `-bun`: vitest runs on Node, where
 * `bun:sqlite` doesn't resolve and v8 coverage needs the Node inspector (see
 * the stack survey). Because app code depends only on the generic
 * `SqlClient.SqlClient` tag, swapping the driver here is transparent.
 *
 * Each build is a fresh independent in-memory DB (closed by the layer scope
 * finalizer). Provide it **per test** — `Effect.provide(TestLive)` inside each
 * `it.effect`, not `it.layer` — so every test gets a clean, migrated database
 * with no cross-test bleed. Migrations run when the layer is built.
 */
const SqlTest = SqliteClient.layer({ filename: ":memory:" });

// The sqlite-node migrator layer requires FileSystem/Path/CommandExecutor (its
// schema-dump path shells out to `sqlite3`). `NodeContext.layer` satisfies them
// so the test layer is self-contained — usable in a plain `it.effect`, not just
// under a server layer that happens to provide the Node platform.
const MigratorTest = SqliteMigrator.layer({
	loader: SqliteMigrator.fromRecord(migrations),
}).pipe(Layer.provide(SqlTest), Layer.provide(NodeContext.layer));

export const DatabaseTest = Layer.merge(SqlTest, MigratorTest);
