import { SqlClient, SqlSchema } from "@effect/sql";
import {
  Account,
  type AccountCreate,
  AccountId,
  type AccountUpdate,
  NotFound,
  Paged,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/** Row shape as stored in sqlite — timestamps are ISO-8601 TEXT. */
const AccountRow = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  type: Schema.String,
  color: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const PagedAccount = Paged(Account);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
const requireOne = (
  found: Option.Option<Account>,
  key: string | number,
): Effect.Effect<Account, NotFound> =>
  Option.match(found, {
    onNone: () => Effect.fail(new NotFound({ resource: "account", id: key })),
    onSome: Effect.succeed,
  });

/**
 * The account repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client
 * and the `:memory:` sqlite-node test client. Typed `NotFound` on the by-id /
 * by-name lookups; writes have no uniqueness constraint, so their `SqlError`
 * collapses to a 500 defect ({@link orDieSql}) — no `Conflict`.
 */
export class AccountRepo extends Effect.Service<AccountRepo>()("api/AccountRepo", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const listQuery = SqlSchema.findAll({
      Request: Schema.Struct({
        limit: Schema.Number,
        offset: Schema.Number,
      }),
      Result: Account,
      execute: ({ limit, offset }) =>
        sql`SELECT * FROM accounts ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
    });

    const countQuery = SqlSchema.single({
      Request: Schema.Void,
      Result: CountResult,
      execute: () => sql`SELECT COUNT(*) AS count FROM accounts`,
    });

    const byIdQuery = SqlSchema.findOne({
      Request: AccountId,
      Result: Account,
      execute: (id) => sql`SELECT * FROM accounts WHERE id = ${id}`,
    });

    const byNameQuery = SqlSchema.findOne({
      Request: Schema.String,
      Result: Account,
      execute: (name) => sql`SELECT * FROM accounts WHERE name = ${name}`,
    });

    const AccountInsert = AccountRow.pipe(Schema.omit("id"));

    const insertQuery = SqlSchema.single({
      Request: AccountInsert,
      Result: Account,
      execute: (row) => sql`INSERT INTO accounts ${sql.insert(row)} RETURNING *`,
    });

    const updateQuery = SqlSchema.single({
      Request: Account,
      Result: Account,
      execute: (row) =>
        sql`UPDATE accounts SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
    });

    const nowIso = Clock.currentTimeMillis.pipe(
      Effect.map((millis) => new Date(millis).toISOString()),
    );

    const list = (limit: number, offset: number) =>
      Effect.all({
        items: listQuery({ limit, offset }),
        total: countQuery(void 0).pipe(Effect.map((r) => r.count)),
      }).pipe(
        Effect.map((paged) => PagedAccount.make(paged)),
        orDieSql,
      );

    const getById = (id: typeof AccountId.Type) =>
      byIdQuery(id).pipe(
        orDieSql,
        Effect.flatMap((found) => requireOne(found, id)),
      );

    const getByName = (name: string) =>
      byNameQuery(name).pipe(
        orDieSql,
        Effect.flatMap((found) => requireOne(found, name)),
      );

    const create = (payload: AccountCreate) =>
      nowIso.pipe(
        Effect.flatMap((now) =>
          insertQuery({
            name: payload.name,
            type: payload.type,
            // `color` is optional on the create payload; normalise the absent
            // case to an explicit null so `sql.insert` always writes the
            // column rather than omitting it from the statement.
            color: payload.color ?? null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
        orDieSql,
      );

    const update = (id: typeof AccountId.Type, changes: AccountUpdate) =>
      Effect.all([getById(id), nowIso]).pipe(
        // getById already 404s if missing; the write then always hits a row.
        Effect.flatMap(([current, now]) =>
          updateQuery(
            new Account({
              ...current,
              ...changes,
              updatedAt: new Date(now),
            }),
          ).pipe(orDieSql),
        ),
      );

    // No `remove` here: deleting an account cascades into the Matching Rules
    // scoped to it and re-derives the rows they had won, all in one
    // transaction, so the delete lives on the `IssuerMatcher`
    // (`applyAccountDelete`, issue #90). A bare delete left on the repository
    // would be a way to bypass the cascade and strand rows on a dead issuer.
    return { list, getById, getByName, create, update } as const;
  }),
}) {}
