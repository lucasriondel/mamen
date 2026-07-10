import { SqlClient, SqlSchema } from "@effect/sql";
import type { Fragment } from "@effect/sql/Statement";
import {
	AnomalyFlag,
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
 * A stored transaction row. The three "boolean" columns are sqlite `INTEGER`
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
	rawMerchantString: Schema.String,
	merchantId: Schema.NullOr(Schema.Number),
	categoryId: Schema.NullOr(Schema.Number),
	subcategoryId: Schema.NullOr(Schema.Number),
	categoryOverride: Schema.NullOr(Schema.String),
	manualCategory: Schema.Number,
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
export const TransactionFromRow = Schema.transform(TransactionRow, Transaction, {
	strict: true,
	decode: (row) => ({
		id: row.id,
		accountId: row.accountId,
		date: row.date,
		amount: row.amount,
		rawMerchantString: row.rawMerchantString,
		...(row.merchantId !== null ? { merchantId: row.merchantId } : {}),
		...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
		...(row.subcategoryId !== null
			? { subcategoryId: row.subcategoryId }
			: {}),
		...(row.categoryOverride !== null
			? { categoryOverride: row.categoryOverride }
			: {}),
		...(row.manualCategory === 1 ? { manualCategory: true } : {}),
		...(row.isRefund === 1 ? { isRefund: true } : {}),
		...(row.linkedRefundId !== null
			? { linkedRefundId: row.linkedRefundId }
			: {}),
		...(row.anomalyFlags !== null
			? { anomalyFlags: Schema.decodeSync(AnomalyFlagsJson)(row.anomalyFlags) }
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
		rawMerchantString: t.rawMerchantString,
		merchantId: t.merchantId ?? null,
		categoryId: t.categoryId ?? null,
		subcategoryId: t.subcategoryId ?? null,
		categoryOverride: t.categoryOverride ?? null,
		manualCategory: t.manualCategory ? 1 : 0,
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
});

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
	merchantId?: number;
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
	rawMerchantString: string;
	merchantId: number | null;
	categoryId: number | null;
	subcategoryId: number | null;
	categoryOverride: string | null;
	manualCategory: number;
	isRefund: number;
	linkedRefundId: number | null;
	anomalyFlags: string | null;
	isDuplicateExcluded: number;
	duplicateNote: string | null;
	importedAt: string;
	importMonth: string;
	importBatchId: string | null;
};

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
					conditions.push(sql`accountId = ${f.accountId}`);
				if (f.merchantId !== undefined)
					conditions.push(sql`merchantId = ${f.merchantId}`);
				if (f.categoryId !== undefined)
					conditions.push(sql`categoryId = ${f.categoryId}`);
				if (f.linkedRefundId !== undefined)
					conditions.push(sql`linkedRefundId = ${f.linkedRefundId}`);
				if (f.importMonth !== undefined)
					conditions.push(sql`importMonth = ${f.importMonth}`);
				if (f.importBatchId !== undefined)
					conditions.push(sql`importBatchId = ${f.importBatchId}`);
				if (f.startDate !== undefined)
					conditions.push(sql`date >= ${f.startDate.toISOString()}`);
				if (f.endDate !== undefined)
					conditions.push(sql`date <= ${f.endDate.toISOString()}`);
				if (f.isRefund !== undefined)
					conditions.push(sql`isRefund = ${f.isRefund ? 1 : 0}`);
				if (f.isDuplicateExcluded !== undefined)
					conditions.push(
						sql`isDuplicateExcluded = ${f.isDuplicateExcluded ? 1 : 0}`,
					);
				return conditions;
			};

			// `sql.and` renders "()" for an empty list, which is not a valid WHERE
			// body — so fall back to an empty fragment (no WHERE) when unfiltered.
			const whereClause = (f: Filters) => {
				const conditions = buildConditions(f);
				return conditions.length === 0 ? sql`` : sql`WHERE ${sql.and(conditions)}`;
			};

			const orderClause = (
				orderBy: "date" | undefined,
				direction: "asc" | "desc",
			) =>
				orderBy === "date"
					? direction === "asc"
						? sql`ORDER BY date ASC`
						: sql`ORDER BY date DESC`
					: sql`ORDER BY id`;

			// `Request: Schema.Any` skips a redundant re-decode: filters are already
			// decoded + branded at the HTTP boundary (`TransactionFilters`), and the
			// params bind through the `sql` fragments, not the Request schema. A
			// `Schema.Struct` Request can't co-exist with the dynamic where/order
			// fragment interpolation.
			const listQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ListFilter>,
				Result: TransactionFromRow,
				execute: (f) =>
					sql`SELECT * FROM transactions ${whereClause(f)} ${orderClause(f.orderBy, f.direction)} LIMIT ${f.limit} OFFSET ${f.offset}`,
			});

			const countQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<Filters>,
				Result: CountResult,
				execute: (f) =>
					sql`SELECT COUNT(*) AS count FROM transactions ${whereClause(f)}`,
			});

			const byIdQuery = SqlSchema.findOne({
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
			// (merchants `toWriteRow`, category `toInsertRow`) — the `id` never
			// travels through here, so no stripping/cast is needed.
			const toWriteRow = (t: TransactionCreate): WriteRow => ({
				accountId: t.accountId,
				date: t.date.toISOString(),
				amount: t.amount,
				rawMerchantString: t.rawMerchantString,
				merchantId: t.merchantId ?? null,
				categoryId: t.categoryId ?? null,
				subcategoryId: t.subcategoryId ?? null,
				categoryOverride: t.categoryOverride ?? null,
				manualCategory: t.manualCategory ? 1 : 0,
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

			const list = (filter: ListFilter) =>
				Effect.all({
					items: listQuery(filter),
					total: countQuery(filter).pipe(Effect.map((r) => r.count)),
				}).pipe(
					Effect.map((paged) => PagedTransaction.make(paged)),
					orDieSql,
				);

			const count = (filter: Filters) =>
				countQuery(filter).pipe(orDieSql);

			const getById = (id: typeof TransactionId.Type) =>
				byIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, id)),
				);

			const create = (payload: TransactionCreate) =>
				insertQuery(toWriteRow(payload)).pipe(orDieSql);

			const update = (
				id: typeof TransactionId.Type,
				changes: TransactionUpdate,
			) =>
				getById(id).pipe(
					// getById already 404s if missing; the write then always hits a row.
					// Merge current + changes into a full field-set, then re-write it.
					Effect.flatMap((current) =>
						updateQuery({
							id,
							...toWriteRow(new Transaction({ ...current, ...changes })),
						}).pipe(orDieSql),
					),
				);

			const remove = (id: typeof TransactionId.Type) =>
				getById(id).pipe(
					Effect.flatMap(() =>
						orDieSql(sql`DELETE FROM transactions WHERE id = ${id}`),
					),
					Effect.asVoid,
				);

			return { list, count, getById, create, update, remove } as const;
		}),
	},
) {}
