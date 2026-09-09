import { BunContext, BunRuntime } from "@effect/platform-bun";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect, Layer } from "effect";
import { migrations } from "../src/db/migrations";
import { seedDemo } from "../src/demo/seed";
import { resolveSeedTarget } from "../src/demo/target";

// Seed a demo database with realistic synthetic data (issue #139):
//
//   bun run seed:demo <path/to/demo.db>
//
// The path is required and is the only thing this writes to — `resolveSeedTarget`
// holds that line, and refuses the API's own database file unless `--force`.
// Everything else is the production data layer with one substitution: the
// filename comes from the command line rather than from `DB_PATH`, so seeding
// cannot be aimed at a developer's database by an environment variable set for
// something else.
//
// Not covered by vitest — it is bootstrap, like `src/index.ts`. What it wires is:
// `src/demo/target.ts` (where it may write) and `src/demo/seed.ts` (what it
// writes), both of which are.

const target = resolveSeedTarget({
  argv: process.argv.slice(2),
  env: process.env,
  cwd: process.cwd(),
});

if (!target.ok) {
  console.error(target.message);
  process.exit(1);
}

const SqlLive = SqliteClient.layer({ filename: target.path });

// The migrations run when the layer is built, so an empty file — or a path with
// no file at all — becomes a fully migrated database before a row is written.
const MigratorLive = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord(migrations),
}).pipe(Layer.provide(SqlLive), Layer.provide(BunContext.layer));

const program = seedDemo.pipe(
  Effect.tap((summary) =>
    Effect.sync(() => {
      console.log(`Seeded ${target.path}`);
      for (const [what, count] of Object.entries(summary)) {
        console.log(`  ${String(count).padStart(4)} ${what}`);
      }
      console.log(`\nRun the API against it with DB_PATH=${target.path}`);
    }),
  ),
  Effect.catchTag("DemoSeedFailure", (failure) =>
    Effect.sync(() => {
      console.error(
        `Refusing to seed ${target.path}: its category tree is missing ${failure.missingCategories.join(", ")}.\n` +
          "The demo categorises its issuers by those slugs. Seed a fresh database instead.",
      );
      process.exit(1);
    }),
  ),
  Effect.provide(Layer.merge(SqlLive, MigratorLive)),
);

BunRuntime.runMain(program);
