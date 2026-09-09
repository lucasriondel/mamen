import { NodeContext } from "@effect/platform-node";
import { SqlClient } from "@effect/sql";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { migrations } from "./index";

/**
 * Idempotency of the one-shot seed (issue #21): the migrator must record
 * migration 0010 as applied, so a **second** run against the same database
 * re-inserts nothing. This is the property that lets the seed be starting data
 * the user can freely delete — a boot-time reconcile would resurrect deletions
 * and, since `slug` has no unique constraint, duplicate rows.
 *
 * Built over a **single shared `:memory:` connection** (one `SqlClient`, two
 * migrator layers), so the second migrator sees the first's bookkeeping — unlike
 * `DatabaseTest`, whose every build is a fresh, independent DB. Driver-switched
 * the same way `DatabaseTest` is: better-sqlite3 (node) by default, `bun:sqlite`
 * under Bun where the native addon can't load.
 */

const countCategories = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`SELECT COUNT(*) AS count FROM categories`;
  return (rows[0] as { count: number }).count;
});

// Node path: one SqlClient, two migrator layers over it. Effect memoizes the
// shared `SqlTest` reference, so both migrators run against the same connection.
const NodeReMigrated = (() => {
  const SqlTest = SqliteClient.layer({ filename: ":memory:" });
  const migrator = () =>
    SqliteMigrator.layer({
      loader: SqliteMigrator.fromRecord(migrations),
    }).pipe(Layer.provide(SqlTest), Layer.provide(NodeContext.layer));
  return Layer.mergeAll(SqlTest, migrator(), migrator());
})();

const BunReMigrated = Layer.unwrapEffect(
  Effect.promise(async () => {
    const [{ SqliteClient: BunSqlite, SqliteMigrator: BunMigrator }, { BunContext }] =
      await Promise.all([import("@effect/sql-sqlite-bun"), import("@effect/platform-bun")]);
    const SqlTest = BunSqlite.layer({ filename: ":memory:" });
    const migrator = () =>
      BunMigrator.layer({
        loader: BunMigrator.fromRecord(migrations),
      }).pipe(Layer.provide(SqlTest), Layer.provide(BunContext.layer));
    return Layer.mergeAll(SqlTest, migrator(), migrator());
  }),
) as typeof NodeReMigrated;

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
const ReMigrated: typeof NodeReMigrated = isBun ? BunReMigrated : NodeReMigrated;

describe("seed migration idempotency", () => {
  it.effect("running the migration set twice does not duplicate the tree", () =>
    Effect.gen(function* () {
      // The layer above has already built (and thus migrated) twice over one
      // connection; the count reflects a single application of the seed.
      const count = yield* countCategories;
      assert.strictEqual(count, 27); // 6 folders + 21 leaves, seeded once
    }).pipe(Effect.provide(ReMigrated)),
  );
});
