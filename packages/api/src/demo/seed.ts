import { SqlClient } from "@effect/sql";
import { Data, Effect } from "effect";
import { orDieSql } from "../db/errors";
import { buildDemoDataset, DEMO_MADE_AT, type DemoTransaction } from "./dataset";

/**
 * The seeder refused before it wrote anything: the database's category tree is
 * missing leaves the demo issuers and rows are categorised by.
 *
 * The tree is planted by a **one-shot migration** and the user is free to
 * rename, re-parent or delete any of it — nothing reconciles it at boot — so a
 * database that has been used is a database whose tree may no longer hold every
 * slug. Failing by name beats the alternatives: inventing the missing categories
 * would resurrect deletions the user made, and writing the rows with a null
 * category would produce a demo whose Recap is half *Uncategorised* with nothing
 * saying why.
 */
export class DemoSeedFailure extends Data.TaggedError("DemoSeedFailure")<{
  readonly missingCategories: ReadonlyArray<string>;
}> {}

/** What was written, for the CLI to print and the tests to hold it to. */
export type DemoSeedSummary = {
  readonly accounts: number;
  readonly issuers: number;
  readonly rules: number;
  readonly transactions: number;
  readonly subscriptions: number;
};

/**
 * The tables the demo owns, in the order they are cleared: children before
 * parents, the mirror of the load order below.
 *
 * `categories` is **not** here. The tree is a migration's work and the migrator
 * records it as applied, so clearing it would leave a database no re-seed could
 * repair. `settings` / `appSettings` / the credential store are not here either:
 * they are the operator's, not the demo's.
 */
const OWNED_TABLES = [
  "transfer_dismissals",
  "subscriptions",
  "transactions",
  "rules",
  "issuers",
  "accounts",
] as const;

/** Fold a dataset row into the stored transaction row, category id resolved. */
const toRow = (
  transaction: DemoTransaction,
  categoryId: (slug: string | null) => number | null,
) => {
  const { categorySlug, ...columns } = transaction;
  return { ...columns, categoryId: categoryId(categorySlug) };
};

/**
 * Seed a database with the demo dataset (issue #139).
 *
 * Depends only on the generic `SqlClient.SqlClient` tag, exactly as every
 * repository does, so the identical code runs against the Bun client the CLI
 * opens over a file and the `:memory:` client the tests build — and it runs
 * outside the HTTP server, which is the whole point of a seed script.
 *
 * Two properties make it re-runnable rather than one-shot:
 *
 * - it **clears the tables it owns** before writing them, so a second run
 *   replaces the demo rather than duplicating it;
 * - every row it writes **carries its own id and its own timestamps**, so the
 *   replacement is byte-for-byte the database the first run produced.
 *
 * The one thing it rewrites that it did not write is the seeded category tree's
 * `createdAt`: the migration stamps it with a real clock, and a demo database
 * that differs from itself by when it was made is not reproducible. Everything
 * else about the tree is left alone.
 *
 * The whole write is one transaction, so a refusal or a failure leaves the
 * database as it was rather than half-seeded.
 */
export const seedDemo: Effect.Effect<DemoSeedSummary, DemoSeedFailure, SqlClient.SqlClient> =
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const data = buildDemoDataset();

    const categories = yield* sql<{
      id: number;
      slug: string;
    }>`SELECT id, slug FROM categories`.pipe(orDieSql);
    const idBySlug = new Map(categories.map((c) => [c.slug, c.id]));

    const wanted = new Set(
      [
        ...data.issuers.map((i) => i.categorySlug),
        ...data.transactions.map((t) => t.categorySlug),
      ].filter((slug): slug is string => slug !== null),
    );
    const missing = [...wanted].filter((slug) => !idBySlug.has(slug)).sort();
    if (missing.length > 0) return yield* new DemoSeedFailure({ missingCategories: missing });

    const categoryId = (slug: string | null) =>
      slug === null ? null : (idBySlug.get(slug) ?? null);

    const insertAll = (table: string, rows: ReadonlyArray<Record<string, unknown>>) =>
      Effect.forEach(rows, (row) => sql`INSERT INTO ${sql(table)} ${sql.insert(row)}`, {
        discard: true,
      });

    yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* Effect.forEach(OWNED_TABLES, (table) => sql`DELETE FROM ${sql(table)}`, {
            discard: true,
          });

          yield* sql`UPDATE categories SET createdAt = ${DEMO_MADE_AT}`;

          // Parents before children, the order `database/repository.ts` loads a
          // dump in: nothing references a row that is not there yet.
          yield* insertAll(
            "accounts",
            data.accounts.map((a) => ({ ...a })),
          );
          yield* insertAll(
            "issuers",
            data.issuers.map((issuer) => ({
              id: issuer.id,
              name: issuer.name,
              imageUrl: null,
              defaultCategoryId: categoryId(issuer.categorySlug),
              notes: issuer.notes,
              excludedFromRecap: issuer.excludedFromRecap ? 1 : 0,
              createdAt: issuer.createdAt,
              firstSeen: issuer.firstSeen,
            })),
          );
          yield* insertAll(
            "rules",
            data.rules.map((r) => ({ ...r })),
          );
          yield* insertAll(
            "transactions",
            data.transactions.map((t) => toRow(t, categoryId)),
          );
          yield* insertAll(
            "subscriptions",
            data.subscriptions.map((s) => ({
              ...s,
              transactionIds: JSON.stringify(s.transactionIds),
            })),
          );
        }),
      )
      .pipe(orDieSql);

    return {
      accounts: data.accounts.length,
      issuers: data.issuers.length,
      rules: data.rules.length,
      transactions: data.transactions.length,
      subscriptions: data.subscriptions.length,
    };
  });
