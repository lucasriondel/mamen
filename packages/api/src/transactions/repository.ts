import { SqlClient, SqlSchema } from "@effect/sql";
import type { Fragment } from "@effect/sql/Statement";
import {
	type AccountId,
	AnomalyFlag,
	CategoryNotLeaf,
	NotFound,
	Paged,
	Transaction,
	type TransactionCreate,
	TransactionId,
	type TransactionUpdate,
} from "@mamen/shared/contract";
import { Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored transaction row. The four "boolean" columns (`manualCategory`,
 * `manualIssuer`, `isRefund`, `isDuplicateExcluded`) are sqlite `INTEGER`
 * 0/1, the FK columns and optional strings come back as `null` (not absent), and
 * `anomalyFlags` is a JSON-encoded TEXT blob (or `null`). {@link TransactionFromRow}
 * folds all of this into the wire `Transaction`: `null` → absent, `1` → `true`
 * (`0` → absent, matching the old `=== 1 ? true : undefined`), JSON → the array.
 */
const TransactionRow = Schema.Struct({
	id: Schema.Number,
	accountId: Schema.Number,
	date: Schema.String,
	amount: Schema.Number,
	rawIssuerString: Schema.String,
	issuerId: Schema.NullOr(Schema.Number),
	categoryId: Schema.NullOr(Schema.Number),
	subcategoryId: Schema.NullOr(Schema.Number),
	categoryOverride: Schema.NullOr(Schema.String),
	manualCategory: Schema.Number,
	manualIssuer: Schema.Number,
	isRefund: Schema.Number,
	linkedRefundId: Schema.NullOr(Schema.Number),
	anomalyFlags: Schema.NullOr(Schema.String),
	isDuplicateExcluded: Schema.Number,
	duplicateNote: Schema.NullOr(Schema.String),
	importedAt: Schema.String,
	importMonth: Schema.String,
	importBatchId: Schema.NullOr(Schema.String),
});

/** The JSON-array codec used inside the `anomalyFlags` TEXT column. */
const AnomalyFlagsJson = Schema.parseJson(Schema.Array(AnomalyFlag));

/**
 * `Schema.transform` maps `TransactionRow`'s decoded type to `Transaction`'s
 * *encoded* shape (ISO strings, present-or-absent optionals, plain-number ids);
 * `Transaction`'s own schema then decodes that into the class. This is where the
 * null → absent fold, the 0/1 → boolean fold, and the JSON parse/stringify of
 * `anomalyFlags` all live, so the handlers only ever see the entity.
 *
 * Exported for the round-trip test: reads decode through it (via `SqlSchema`),
 * and the storage inverse (`encode`) is verified directly rather than left dead,
 * since the write path builds its row with the hand-written `toWriteRow` below.
 */
export const TransactionFromRow = Schema.transform(
	TransactionRow,
	Transaction,
	{
		strict: true,
		decode: (row) => ({
			id: row.id,
			accountId: row.accountId,
			date: row.date,
			amount: row.amount,
			rawIssuerString: row.rawIssuerString,
			...(row.issuerId !== null ? { issuerId: row.issuerId } : {}),
			...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
			...(row.subcategoryId !== null
				? { subcategoryId: row.subcategoryId }
				: {}),
			...(row.categoryOverride !== null
				? { categoryOverride: row.categoryOverride }
				: {}),
			...(row.manualCategory === 1 ? { manualCategory: true } : {}),
			...(row.manualIssuer === 1 ? { manualIssuer: true } : {}),
			...(row.isRefund === 1 ? { isRefund: true } : {}),
			...(row.linkedRefundId !== null
				? { linkedRefundId: row.linkedRefundId }
				: {}),
			...(row.anomalyFlags !== null
				? {
						anomalyFlags: Schema.decodeSync(AnomalyFlagsJson)(row.anomalyFlags),
					}
				: {}),
			...(row.isDuplicateExcluded === 1 ? { isDuplicateExcluded: true } : {}),
			...(row.duplicateNote !== null
				? { duplicateNote: row.duplicateNote }
				: {}),
			importedAt: row.importedAt,
			importMonth: row.importMonth,
			...(row.importBatchId !== null
				? { importBatchId: row.importBatchId }
				: {}),
		}),
		encode: (t) => ({
			id: t.id,
			accountId: t.accountId,
			date: t.date,
			amount: t.amount,
			rawIssuerString: t.rawIssuerString,
			issuerId: t.issuerId ?? null,
			categoryId: t.categoryId ?? null,
			subcategoryId: t.subcategoryId ?? null,
			categoryOverride: t.categoryOverride ?? null,
			manualCategory: t.manualCategory ? 1 : 0,
			manualIssuer: t.manualIssuer ? 1 : 0,
			isRefund: t.isRefund ? 1 : 0,
			linkedRefundId: t.linkedRefundId ?? null,
			anomalyFlags:
				t.anomalyFlags !== undefined
					? Schema.encodeSync(AnomalyFlagsJson)(t.anomalyFlags)
					: null,
			isDuplicateExcluded: t.isDuplicateExcluded ? 1 : 0,
			duplicateNote: t.duplicateNote ?? null,
			importedAt: t.importedAt,
			importMonth: t.importMonth,
			importBatchId: t.importBatchId ?? null,
		}),
	},
);

const PagedTransaction = Paged(Transaction);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/**
 * The composable filter set, decoded + branded at the HTTP boundary
 * (`TransactionFilters`). Every field optional; all present ones combine with
 * `AND`. `startDate`/`endDate` are inclusive bounds on `date`.
 */
type Filters = {
	accountId?: number;
	issuerId?: number;
	categoryId?: number;
	linkedRefundId?: number;
	importMonth?: string;
	importBatchId?: string;
	startDate?: Date;
	endDate?: Date;
	isRefund?: boolean;
	isDuplicateExcluded?: boolean;
};

/** The full `list` filter — the composable set plus pagination + ordering. */
type ListFilter = Filters & {
	limit: number;
	offset: number;
	orderBy?: "date";
	direction: "asc" | "desc";
};

/** A plain null-mapped write row (the shape bound into INSERT/UPDATE). */
type WriteRow = {
	accountId: number;
	date: string;
	amount: number;
	rawIssuerString: string;
	issuerId: number | null;
	categoryId: number | null;
	subcategoryId: number | null;
	categoryOverride: string | null;
	manualCategory: number;
	manualIssuer: number;
	isRefund: number;
	linkedRefundId: number | null;
	anomalyFlags: string | null;
	isDuplicateExcluded: number;
	duplicateNote: string | null;
	importedAt: string;
	importMonth: string;
	importBatchId: string | null;
};

/** A write row carrying its `id` — bound into `bulkPut`'s `INSERT OR REPLACE`. */
type WriteRowWithId = WriteRow & { id: number };

/**
 * The transaction repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client
 * and the `:memory:` sqlite-node test client. Typed `NotFound` on `getById`;
 * writes have no uniqueness constraint (no DB FKs either — inventory §3), so
 * their `SqlError` collapses to a 500 defect ({@link orDieSql}) — no `Conflict`.
 *
 * The core redesign is {@link buildConditions}: `list` and `count` share one
 * composable `AND`-combined WHERE, replacing the old 9-branch either/or fan-out
 * where `accountId` dominated and every other filter was unreachable.
 */
export class TransactionRepo extends Effect.Service<TransactionRepo>()(
	"api/TransactionRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// Each present filter contributes one predicate; absent ones contribute
			// nothing. `dates` bind as ISO strings (the `date` column is ISO TEXT,
			// so lexicographic comparison matches chronological order). Returns the
			// fragment list; an empty list means "no WHERE" (whole table).
			const buildConditions = (f: Filters): Array<Fragment> => {
				const conditions: Array<Fragment> = [];
				if (f.accountId !== undefined)
					conditions.push(sql`t.accountId = ${f.accountId}`);
				if (f.issuerId !== undefined)
					conditions.push(sql`t.issuerId = ${f.issuerId}`);
				if (f.categoryId !== undefined)
					conditions.push(sql`t.categoryId = ${f.categoryId}`);
				if (f.linkedRefundId !== undefined)
					conditions.push(sql`t.linkedRefundId = ${f.linkedRefundId}`);
				if (f.importMonth !== undefined)
					conditions.push(sql`t.importMonth = ${f.importMonth}`);
				if (f.importBatchId !== undefined)
					conditions.push(sql`t.importBatchId = ${f.importBatchId}`);
				if (f.startDate !== undefined)
					conditions.push(sql`t.date >= ${f.startDate.toISOString()}`);
				if (f.endDate !== undefined)
					conditions.push(sql`t.date <= ${f.endDate.toISOString()}`);
				if (f.isRefund !== undefined)
					conditions.push(sql`t.isRefund = ${f.isRefund ? 1 : 0}`);
				if (f.isDuplicateExcluded !== undefined)
					conditions.push(
						sql`t.isDuplicateExcluded = ${f.isDuplicateExcluded ? 1 : 0}`,
					);
				return conditions;
			};

			// `sql.and` renders "()" for an empty list, which is not a valid WHERE
			// body — so fall back to an empty fragment (no WHERE) when unfiltered.
			const whereClause = (f: Filters) => {
				const conditions = buildConditions(f);
				return conditions.length === 0
					? sql``
					: sql`WHERE ${sql.and(conditions)}`;
			};

			const orderClause = (
				orderBy: "date" | undefined,
				direction: "asc" | "desc",
			) =>
				orderBy === "date"
					? direction === "asc"
						? sql`ORDER BY t.date ASC`
						: sql`ORDER BY t.date DESC`
					: sql`ORDER BY t.id`;

			// The read projection (model A / Derived category, PRD #8 issue #13):
			// every stored transaction column is read verbatim except `categoryId`,
			// which is read *through* the row's issuer. A non-manual row takes its issuer's
			// `defaultCategoryId` (LEFT JOIN `issuers`, `null` when unmatched or the
			// issuer has no default); a `manualCategory` row keeps its own stored
			// `categoryId` (manual wins). Derivation is query-time only — no column
			// is written — so re-categorising an issuer reclassifies its whole
			// history at once. Reads go through this; writes (`RETURNING *`) echo the
			// stored row verbatim, and the internal `storedByIdQuery` reads the raw
			// row so an update's merge never persists a derived value.
			const readColumns = sql`t.id, t.accountId, t.date, t.amount, t.rawIssuerString, t.issuerId, CASE WHEN t.manualCategory = 1 THEN t.categoryId ELSE i.defaultCategoryId END AS categoryId, t.subcategoryId, t.categoryOverride, t.manualCategory, t.manualIssuer, t.isRefund, t.linkedRefundId, t.anomalyFlags, t.isDuplicateExcluded, t.duplicateNote, t.importedAt, t.importMonth, t.importBatchId`;
			const readFrom = sql`FROM transactions t LEFT JOIN issuers i ON t.issuerId = i.id`;

			// `Request: Schema.Any` skips a redundant re-decode: filters are already
			// decoded + branded at the HTTP boundary (`TransactionFilters`), and the
			// params bind through the `sql` fragments, not the Request schema. A
			// `Schema.Struct` Request can't co-exist with the dynamic where/order
			// fragment interpolation.
			const listQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ListFilter>,
				Result: TransactionFromRow,
				execute: (f) =>
					sql`SELECT ${readColumns} ${readFrom} ${whereClause(f)} ${orderClause(f.orderBy, f.direction)} LIMIT ${f.limit} OFFSET ${f.offset}`,
			});

			const countQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<Filters>,
				Result: CountResult,
				execute: (f) =>
					sql`SELECT COUNT(*) AS count FROM transactions t ${whereClause(f)}`,
			});

			const byIdQuery = SqlSchema.findOne({
				Request: TransactionId,
				Result: TransactionFromRow,
				execute: (id) =>
					sql`SELECT ${readColumns} ${readFrom} WHERE t.id = ${id}`,
			});

			// Internal read: the raw stored row (no derivation). The merge base for
			// `update` and the existence check for `update`/`remove`, so a write never
			// round-trips a *derived* category back into the stored column.
			const storedByIdQuery = SqlSchema.findOne({
				Request: TransactionId,
				Result: TransactionFromRow,
				execute: (id) => sql`SELECT * FROM transactions WHERE id = ${id}`,
			});

			// Writes bind a plain null-mapped `WriteRow`. `Request: Schema.Any`
			// because the row is already a plain object (built in `create`/`update`),
			// not something to decode; only the `Result` decode (RETURNING → entity)
			// matters here.
			const insertQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<WriteRow>,
				Result: TransactionFromRow,
				execute: (row) =>
					sql`INSERT INTO transactions ${sql.insert(row)} RETURNING *`,
			});

			const updateQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<
					WriteRow & { id: typeof TransactionId.Type }
				>,
				Result: TransactionFromRow,
				execute: (row) =>
					sql`UPDATE transactions SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
			});

			// `bulkPut` upsert: the record carries its own `id`, so `INSERT OR REPLACE`
			// creates-or-overwrites by primary key (faithful to the old adapter). Bound
			// per row; the result is discarded (bulk-put returns only the count).
			const upsertQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<WriteRowWithId>,
				Result: Schema.Struct({ id: Schema.Number }),
				execute: (row) =>
					sql`INSERT OR REPLACE INTO transactions ${sql.insert(row)} RETURNING id`,
			});

			// Reads a set of ids in one statement (partial existence allowed — the
			// result holds only the ids that exist, order is arbitrary).
			const bulkGetQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ReadonlyArray<number>>,
				Result: TransactionFromRow,
				execute: (ids) =>
					sql`SELECT ${readColumns} ${readFrom} WHERE ${sql.in("t.id", ids)}`,
			});

			// One indexed lookup of a category's `parentId` — the leaf/folder test
			// for the two-level invariant guard. A `null` parentId is a folder
			// (root); a non-null one is a leaf. Mirrors the issuer repo's guard.
			const parentIdQuery = SqlSchema.findOne({
				Request: Schema.Number,
				Result: Schema.Struct({ parentId: Schema.NullOr(Schema.Number) }),
				execute: (id) => sql`SELECT parentId FROM categories WHERE id = ${id}`,
			});

			// The folders among a set of category ids — the batch leaf test a bulk
			// payload runs in **one** query, not one per row (ADR 0001). Any id it
			// returns is a folder (`parentId IS NULL`); an empty result means every
			// id is a leaf or unknown.
			const foldersInQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ReadonlyArray<number>>,
				Result: Schema.Struct({ id: Schema.Number }),
				execute: (ids) =>
					sql`SELECT id FROM categories WHERE parentId IS NULL AND ${sql.in("id", ids)}`,
			});

			/**
			 * The two-level invariant (ADR 0001, rule 4) at the transactions door: a
			 * `categoryId` must be an assignable **leaf**, never a **folder** (a
			 * category with no parent) — the same corruption, arriving through a
			 * different door than the issuer default. Absent (`undefined`) or `null`
			 * skips the check; an unknown id is left to pass (no FK exists — policing
			 * missing rows is not this invariant's job). Enforced on both a manual
			 * and a non-manual write: a folder id stored today becomes live the moment
			 * the row is flipped manual.
			 */
			const assertLeaf = (
				categoryId: number | null | undefined,
			): Effect.Effect<void, CategoryNotLeaf> =>
				categoryId == null
					? Effect.void
					: parentIdQuery(categoryId).pipe(
							orDieSql,
							Effect.flatMap((found) =>
								Option.match(found, {
									onNone: () => Effect.void,
									onSome: (row) =>
										row.parentId === null
											? Effect.fail(new CategoryNotLeaf({ categoryId }))
											: Effect.void,
								}),
							),
						);

			// Batch guard for a bulk payload: resolve every distinct categoryId's
			// leaf/folder status in **one** query (ADR 0001), failing on the first
			// folder found. An empty id set (no row carries a category) touches no DB.
			const assertAllLeaves = (
				records: ReadonlyArray<TransactionCreate>,
			): Effect.Effect<void, CategoryNotLeaf> => {
				const ids = [
					...new Set(
						records.flatMap((r) =>
							r.categoryId != null ? [r.categoryId] : [],
						),
					),
				];
				return ids.length === 0
					? Effect.void
					: foldersInQuery(ids).pipe(
							orDieSql,
							Effect.flatMap((rows) =>
								rows.length === 0
									? Effect.void
									: Effect.fail(
											new CategoryNotLeaf({ categoryId: rows[0]?.id ?? 0 }),
										),
							),
						);
			};

			/** Unwrap a lookup's `Option`, 404-ing when absent (id goes on the error). */
			const requireOne = (
				found: Option.Option<Transaction>,
				id: string | number,
			): Effect.Effect<Transaction, NotFound> =>
				Option.match(found, {
					onNone: () =>
						Effect.fail(new NotFound({ resource: "transaction", id })),
					onSome: Effect.succeed,
				});

			// Fold a payload / entity into a plain, null-mapped write row: optional
			// fields absent → `null`, booleans → 0/1, `anomalyFlags` → its JSON
			// string, dates → ISO. Same explicit-field style as the sibling repos
			// (issuers `toWriteRow`, category `toInsertRow`) — the `id` never
			// travels through here, so no stripping/cast is needed.
			const toWriteRow = (t: TransactionCreate): WriteRow => ({
				accountId: t.accountId,
				date: t.date.toISOString(),
				amount: t.amount,
				rawIssuerString: t.rawIssuerString,
				issuerId: t.issuerId ?? null,
				categoryId: t.categoryId ?? null,
				subcategoryId: t.subcategoryId ?? null,
				categoryOverride: t.categoryOverride ?? null,
				manualCategory: t.manualCategory ? 1 : 0,
				manualIssuer: t.manualIssuer ? 1 : 0,
				isRefund: t.isRefund ? 1 : 0,
				linkedRefundId: t.linkedRefundId ?? null,
				anomalyFlags:
					t.anomalyFlags !== undefined
						? Schema.encodeSync(AnomalyFlagsJson)(t.anomalyFlags)
						: null,
				isDuplicateExcluded: t.isDuplicateExcluded ? 1 : 0,
				duplicateNote: t.duplicateNote ?? null,
				importedAt: t.importedAt.toISOString(),
				importMonth: t.importMonth,
				importBatchId: t.importBatchId ?? null,
			});

			// `bulkPut` variant: the full entity carries an `id`, so the write row
			// keeps it (folded the same way as `toWriteRow`). Used only for the
			// `INSERT OR REPLACE` upsert, where the primary key drives the merge.
			const toWriteRowWithId = (t: Transaction): WriteRowWithId => ({
				id: t.id,
				...toWriteRow(t),
			});

			// A count of rows deleted by a `DELETE ... RETURNING id`. sqlite's
			// `RETURNING` yields one row per deleted row, so its length is the exact
			// affected count — the useful result a bulk delete returns (taxonomy §5).
			// The `SqlError` isn't client-actionable → dies as a 500 ({@link orDieSql}).
			const deleteReturningCount = <E, R>(
				statement: Effect.Effect<ReadonlyArray<unknown>, E, R>,
			) =>
				statement.pipe(
					Effect.map((rows) => ({ count: rows.length })),
					orDieSql,
				);

			const list = (filter: ListFilter) =>
				Effect.all({
					items: listQuery(filter),
					total: countQuery(filter).pipe(Effect.map((r) => r.count)),
				}).pipe(
					Effect.map((paged) => PagedTransaction.make(paged)),
					orDieSql,
				);

			const count = (filter: Filters) => countQuery(filter).pipe(orDieSql);

			const getById = (id: typeof TransactionId.Type) =>
				byIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, id)),
				);

			// The raw stored row (no derivation) — merge base + existence check for the
			// write paths, so an update never persists a *derived* category back onto
			// the row. Public `getById` stays derived; only writes use this.
			const getStoredById = (id: typeof TransactionId.Type) =>
				storedByIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, id)),
				);

			const create = (payload: TransactionCreate) =>
				assertLeaf(payload.categoryId).pipe(
					Effect.andThen(insertQuery(toWriteRow(payload)).pipe(orDieSql)),
				);

			const update = (
				id: typeof TransactionId.Type,
				changes: TransactionUpdate,
			) =>
				// Guard only the incoming change: a folder categoryId in the payload is
				// rejected before the merge (a leaf already stored stays untouched).
				assertLeaf(changes.categoryId).pipe(
					Effect.andThen(getStoredById(id)),
					// getStoredById 404s if missing; the write then always hits a row.
					// Merge the raw *stored* row (never the derived read — that would
					// round-trip a derived category into storage) with the changes,
					// then re-write the full field-set.
					Effect.flatMap((current) =>
						updateQuery({
							id,
							...toWriteRow(new Transaction({ ...current, ...changes })),
						}).pipe(orDieSql),
					),
				);

			const remove = (id: typeof TransactionId.Type) =>
				getStoredById(id).pipe(
					Effect.flatMap(() =>
						orDieSql(sql`DELETE FROM transactions WHERE id = ${id}`),
					),
					Effect.asVoid,
				);

			// Insert every record, returning the created rows with generated ids
			// (201). Reuses the core single-row `insertQuery`; an empty `records`
			// array runs no statement and yields `[]`. A folder in any row's
			// `categoryId` is rejected up front in one query (ADR 0001), before a
			// single row is written.
			const bulkCreate = (records: ReadonlyArray<TransactionCreate>) =>
				assertAllLeaves(records).pipe(
					Effect.andThen(
						Effect.forEach(records, (payload) =>
							insertQuery(toWriteRow(payload)),
						).pipe(orDieSql),
					),
				);

			// Upsert every full record by id (`INSERT OR REPLACE`). Returns the count
			// written (every record is affected — upsert never no-ops). Empty → 0.
			const bulkPut = (records: ReadonlyArray<Transaction>) =>
				Effect.forEach(records, (record) =>
					upsertQuery(toWriteRowWithId(record)),
				).pipe(
					Effect.map((batches) => ({ count: batches.flat().length })),
					orDieSql,
				);

			// Delete the given ids in one statement; the count is how many actually
			// existed (partial-existence: unknown ids contribute nothing). Empty → 0
			// without touching the DB (`sql.in([])` would render an invalid `IN ()`).
			const bulkDelete = (ids: ReadonlyArray<typeof TransactionId.Type>) =>
				ids.length === 0
					? Effect.succeed({ count: 0 })
					: deleteReturningCount(
							sql`DELETE FROM transactions WHERE ${sql.in("id", ids)} RETURNING id`,
						);

			// Read the given ids; only existing rows come back (partial existence),
			// so the result may be shorter than `ids`. Empty → `[]` without a query.
			const bulkGet = (ids: ReadonlyArray<typeof TransactionId.Type>) =>
				ids.length === 0
					? Effect.succeed([] as ReadonlyArray<Transaction>)
					: bulkGetQuery(ids).pipe(orDieSql);

			// Targeted delete: both params required at the boundary. Returns the
			// deleted count (was `{ ok: true }` in the old server; taxonomy §5).
			const deleteByAccountMonth = (
				accountId: typeof AccountId.Type,
				importMonth: string,
			) =>
				deleteReturningCount(
					sql`DELETE FROM transactions WHERE accountId = ${accountId} AND importMonth = ${importMonth} RETURNING id`,
				);

			const deleteByImportBatch = (batchId: string) =>
				deleteReturningCount(
					sql`DELETE FROM transactions WHERE importBatchId = ${batchId} RETURNING id`,
				);

			return {
				list,
				count,
				getById,
				create,
				update,
				remove,
				bulkCreate,
				bulkPut,
				bulkDelete,
				bulkGet,
				deleteByAccountMonth,
				deleteByImportBatch,
			} as const;
		}),
	},
) {}
