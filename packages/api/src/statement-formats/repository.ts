import { SqlClient, SqlSchema } from "@effect/sql";
import {
  type AccountId,
  ColumnMapping,
  NotFound,
  Paged,
  StatementFormat,
  type StatementFormatCreate,
  StatementFormatId,
  ValueRules,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored **Statement Format** row (migration 0032). Timestamps are ISO-8601
 * TEXT and the branded ids come back as plain numbers, as everywhere else here.
 *
 * Three columns are JSON in TEXT — `declaredColumns`, `mapping` and `rules` —
 * following the pattern `anomalyFlags` set and `rawSource` extends: opaque to
 * SQL, parsed and stringified by {@link StatementFormatFromRow} so the handlers
 * only ever see the nested objects.
 *
 * `kind` is read as the literal union rather than as a string: sqlite has no
 * enum type, so this codec is what constrains the column to the two kinds the
 * contract knows. A third value is not a format anything can apply, and failing
 * the decode says so where it happened.
 */
const StatementFormatRow = Schema.Struct({
  id: Schema.Number,
  accountId: Schema.Number,
  name: Schema.String,
  kind: Schema.Literal("csv", "pdf"),
  declaredColumns: Schema.String,
  mapping: Schema.String,
  rules: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

/** The JSON codecs used inside the three TEXT columns that hold structure. */
const DeclaredColumnsJson = Schema.parseJson(Schema.Array(Schema.String));
const MappingJson = Schema.parseJson(ColumnMapping);
const RulesJson = Schema.parseJson(ValueRules);

/**
 * The one list of column names a format declares, whichever name its `kind`
 * gives it — a CSV's header fingerprint or the columns a PDF extraction asks the
 * model for — encoded for the single `declaredColumns` column that holds it.
 *
 * Stated once because both write directions need it: the codec's `encode` and
 * the INSERT's {@link toWriteRow}. Two copies would be two definitions of which
 * list a `pdf` row stores, and they would drift the day a third kind appears.
 */
const encodeDeclaredColumns = (
  format:
    | { readonly kind: "csv"; readonly headers: readonly string[] }
    | { readonly kind: "pdf"; readonly columns: readonly string[] },
): string =>
  Schema.encodeSync(DeclaredColumnsJson)(format.kind === "csv" ? format.headers : format.columns);

/**
 * `Schema.transform` maps `StatementFormatRow`'s decoded type to
 * `StatementFormat`'s *encoded* shape (ISO strings, plain-number ids, nested
 * objects); the entity's own union schema then decodes that into the CSV or the
 * PDF class.
 *
 * This is where the storage/wire difference lives, and it is a real one in both
 * directions. Storage keeps **one** `declaredColumns` column, because a format
 * always declares exactly one such list; the wire keeps them apart as `headers`
 * (the fingerprint a CSV must match) and `columns` (what a PDF extraction should
 * ask the model for), because they are read for different reasons and reading
 * one as the other is a mistake worth a type error.
 *
 * Exported for the round-trip test: reads decode through it (via `SqlSchema`),
 * and the storage inverse (`encode`) is verified directly rather than left dead,
 * since the write path builds its row with the hand-written {@link toWriteRow}.
 */
export const StatementFormatFromRow = Schema.transform(StatementFormatRow, StatementFormat, {
  strict: true,
  decode: (row) => {
    const declaredColumns = Schema.decodeSync(DeclaredColumnsJson)(row.declaredColumns);
    const shared = {
      id: row.id,
      accountId: row.accountId,
      name: row.name,
      mapping: Schema.decodeSync(MappingJson)(row.mapping),
      rules: Schema.decodeSync(RulesJson)(row.rules),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return row.kind === "csv"
      ? { ...shared, kind: "csv" as const, headers: declaredColumns }
      : { ...shared, kind: "pdf" as const, columns: declaredColumns };
  },
  encode: (format) => ({
    id: format.id,
    accountId: format.accountId,
    name: format.name,
    kind: format.kind,
    declaredColumns: encodeDeclaredColumns(format),
    mapping: Schema.encodeSync(MappingJson)(format.mapping),
    rules: Schema.encodeSync(RulesJson)(format.rules),
    createdAt: format.createdAt,
    updatedAt: format.updatedAt,
  }),
});

const PagedStatementFormat = Paged(StatementFormat);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/** The `list` filter, decoded from the query string (`accountId` optional). */
type ListFilter = {
  limit: number;
  offset: number;
  accountId?: typeof AccountId.Type;
};

/** A plain write row (the shape bound into the INSERT). */
type WriteRow = {
  accountId: number;
  name: string;
  kind: "csv" | "pdf";
  declaredColumns: string;
  mapping: string;
  rules: string;
  createdAt: string;
  updatedAt: string;
};

/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
const requireOne = (
  found: Option.Option<StatementFormat>,
  key: string | number,
): Effect.Effect<StatementFormat, NotFound> =>
  Option.match(found, {
    onNone: () => Effect.fail(new NotFound({ resource: "statement format", id: key })),
    onSome: Effect.succeed,
  });

/**
 * Fold a create payload into the columns the INSERT binds. `createdAt` and
 * `updatedAt` are the server's to stamp and are equal on a create — a format is
 * never edited, so they stay equal for the row's whole life.
 */
const toWriteRow = (payload: StatementFormatCreate, now: string): WriteRow => ({
  accountId: payload.accountId,
  name: payload.name,
  kind: payload.kind,
  declaredColumns: encodeDeclaredColumns(payload),
  mapping: Schema.encodeSync(MappingJson)(payload.mapping),
  rules: Schema.encodeSync(RulesJson)(payload.rules),
  createdAt: now,
  updatedAt: now,
});

/**
 * The statement-formats repository, on `@effect/sql`. Depends only on the
 * generic `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod
 * client and the `:memory:` sqlite-node test client. Typed `NotFound` on the
 * by-id lookup; there is no uniqueness constraint on the table, so a write's
 * `SqlError` collapses to a 500 defect ({@link orDieSql}) — no `Conflict`.
 *
 * Reads and one write, and no more: editing and deleting a format are out of
 * this PRD's scope. A bank that changes its export earns a **new** format, so
 * the statements downloaded before the change keep one that reads them, and what
 * a delete would mean for imports already made under a format is a question
 * nothing here answers yet.
 */
export class StatementFormatRepo extends Effect.Service<StatementFormatRepo>()(
  "api/StatementFormatRepo",
  {
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // The `accountId` filter: present -> that account's formats, absent -> the
      // whole table. `list` and its count share it, so the page and the total
      // can never disagree about which set they describe.
      const whereClause = (accountId: number | undefined) =>
        accountId === undefined ? sql`` : sql`WHERE accountId = ${accountId}`;

      // `Request: Schema.Any` skips a redundant re-decode: the filter is already
      // decoded + branded at the HTTP boundary (`StatementFormatListFilters` via
      // `numFromStr(AccountId)`), and the params bind through the `sql` fragment
      // below, not the Request schema — which a `Schema.Struct` Request cannot
      // co-exist with.
      const listQuery = SqlSchema.findAll({
        Request: Schema.Any as Schema.Schema<ListFilter>,
        Result: StatementFormatFromRow,
        execute: ({ limit, offset, accountId }) =>
          sql`SELECT * FROM statement_formats ${whereClause(accountId)} ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
      });

      const countQuery = SqlSchema.single({
        Request: Schema.Any as Schema.Schema<{ accountId?: number }>,
        Result: CountResult,
        execute: ({ accountId }) =>
          sql`SELECT COUNT(*) AS count FROM statement_formats ${whereClause(accountId)}`,
      });

      const byIdQuery = SqlSchema.findOne({
        Request: StatementFormatId,
        Result: StatementFormatFromRow,
        execute: (id) => sql`SELECT * FROM statement_formats WHERE id = ${id}`,
      });

      const insertQuery = SqlSchema.single({
        Request: Schema.Any as Schema.Schema<WriteRow>,
        Result: StatementFormatFromRow,
        execute: (row) => sql`INSERT INTO statement_formats ${sql.insert(row)} RETURNING *`,
      });

      const nowIso = Clock.currentTimeMillis.pipe(
        Effect.map((millis) => new Date(millis).toISOString()),
      );

      const list = (filter: ListFilter) =>
        Effect.all({
          items: listQuery(filter),
          total: countQuery({ accountId: filter.accountId }).pipe(Effect.map((r) => r.count)),
        }).pipe(
          Effect.map((paged) => PagedStatementFormat.make(paged)),
          orDieSql,
        );

      const getById = (id: typeof StatementFormatId.Type) =>
        byIdQuery(id).pipe(
          orDieSql,
          Effect.flatMap((found) => requireOne(found, id)),
        );

      const create = (payload: StatementFormatCreate) =>
        nowIso.pipe(
          Effect.flatMap((now) => insertQuery(toWriteRow(payload, now))),
          orDieSql,
        );

      return { list, getById, create } as const;
    }),
  },
) {}
