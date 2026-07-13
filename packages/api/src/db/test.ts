import { NodeContext } from "@effect/platform-node";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { migrations } from "./migrations";

/**
 * The `:memory:` test data layer — the reusable helper every DB-backed port's
 * tests build on (settles the map's open "sqlite `:memory:` test-layer wiring").
 *
 * Default driver is `@effect/sql-sqlite-node` (better-sqlite3): under Node,
 * where vitest usually runs, `bun:sqlite` doesn't resolve and v8 coverage needs
 * the Node inspector (see the stack survey). But better-sqlite3's native addon
 * cannot load under Bun, so a Bun-only environment (e.g. a sandbox without a
 * native Node) is switched at runtime to the `@effect/sql-sqlite-bun` driver
 * (`bun:sqlite`) — the same client the production layer uses. Because app code
 * depends only on the generic `SqlClient.SqlClient` tag, swapping the driver is
 * transparent, and the two paths run the identical migration set.
 *
 * Each build is a fresh independent in-memory DB (closed by the layer scope
 * finalizer). Provide it **per test** — `Effect.provide(TestLive)` inside each
 * `it.effect`, not `it.layer` — so every test gets a clean, migrated database
 * with no cross-test bleed. Migrations run when the layer is built.
 */

// The sqlite-node migrator layer requires FileSystem/Path/CommandExecutor (its
// schema-dump path shells out to `sqlite3`). `NodeContext.layer` satisfies them
// so the test layer is self-contained — usable in a plain `it.effect`, not just
// under a server layer that happens to provide the Node platform.
const NodeDatabaseTest = (() => {
	const SqlTest = SqliteClient.layer({ filename: ":memory:" });
	const MigratorTest = SqliteMigrator.layer({
		loader: SqliteMigrator.fromRecord(migrations),
	}).pipe(Layer.provide(SqlTest), Layer.provide(NodeContext.layer));
	return Layer.merge(SqlTest, MigratorTest);
})();

// Bun path: `@effect/sql-sqlite-bun` statically imports `bun:sqlite`, which
// throws at import time under Node — so it is loaded via dynamic `import()`,
// deferred behind `Layer.unwrapEffect` and only ever reached when running on
// Bun. `BunContext.layer` plays the role `NodeContext.layer` does above.
const BunDatabaseTest = Layer.unwrapEffect(
	Effect.promise(async () => {
		const [
			{ SqliteClient: BunSqlite, SqliteMigrator: BunMigrator },
			{ BunContext },
		] = await Promise.all([
			import("@effect/sql-sqlite-bun"),
			import("@effect/platform-bun"),
		]);
		const SqlTest = BunSqlite.layer({ filename: ":memory:" });
		const MigratorTest = BunMigrator.layer({
			loader: BunMigrator.fromRecord(migrations),
		}).pipe(Layer.provide(SqlTest), Layer.provide(BunContext.layer));
		return Layer.merge(SqlTest, MigratorTest);
	}),
) as typeof NodeDatabaseTest;

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

export const DatabaseTest: typeof NodeDatabaseTest = isBun
	? BunDatabaseTest
	: NodeDatabaseTest;
