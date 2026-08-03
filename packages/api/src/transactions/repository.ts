import { SqlClient, SqlSchema } from "@effect/sql";
import type { Fragment } from "@effect/sql/Statement";
import {
	type AccountId,
	AnomalyFlag,
	CategoryNotLeaf,
	NotFound,
	Paged,
	TRANSFER_DATE_WINDOW_DAYS,
	Transaction,
	type TransactionCreate,
	TransactionId,
	type TransactionUpdate,
	TransferCandidate,
	TransferInvalid,
} from "@mamen/shared/contract";
import { Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored transaction row. The six "boolean" columns (`manualCategory`,
 * `manualIssuer`, `isRefund`, `isDuplicateExcluded`, `excludedFromRecap`,
 * `manualExcluded`) are sqlite `INTEGER`
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
	manualCategory: Schema.Number,
	manualIssuer: Schema.Number,
	isRefund: Schema.Number,
	linkedRefundId: Schema.NullOr(Schema.Number),
	transferGroupId: Schema.NullOr(Schema.Number),
	anomalyFlags: Schema.NullOr(Schema.String),
	isDuplicateExcluded: Schema.Number,
	duplicateNote: Schema.NullOr(Schema.String),
	excludedFromRecap: Schema.Number,
	manualExcluded: Schema.Number,
	notes: Schema.NullOr(Schema.String),
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
			...(row.manualCategory === 1 ? { manualCategory: true } : {}),
			...(row.manualIssuer === 1 ? { manualIssuer: true } : {}),
			...(row.isRefund === 1 ? { isRefund: true } : {}),
			...(row.linkedRefundId !== null
				? { linkedRefundId: row.linkedRefundId }
				: {}),
			...(row.transferGroupId !== null
				? { transferGroupId: row.transferGroupId }
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
			...(row.excludedFromRecap === 1 ? { excludedFromRecap: true } : {}),
			...(row.manualExcluded === 1 ? { manualExcluded: true } : {}),
			...(row.notes !== null ? { notes: row.notes } : {}),
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
			manualCategory: t.manualCategory ? 1 : 0,
			manualIssuer: t.manualIssuer ? 1 : 0,
			isRefund: t.isRefund ? 1 : 0,
			linkedRefundId: t.linkedRefundId ?? null,
			transferGroupId: t.transferGroupId ?? null,
			anomalyFlags:
				t.anomalyFlags !== undefined
					? Schema.encodeSync(AnomalyFlagsJson)(t.anomalyFlags)
					: null,
			isDuplicateExcluded: t.isDuplicateExcluded ? 1 : 0,
			duplicateNote: t.duplicateNote ?? null,
			excludedFromRecap: t.excludedFromRecap ? 1 : 0,
			manualExcluded: t.manualExcluded ? 1 : 0,
			notes: t.notes ?? null,
			importedAt: t.importedAt,
			importMonth: t.importMonth,
			importBatchId: t.importBatchId ?? null,
		}),
	},
);

const PagedTransaction = Paged(Transaction);

/** Decoder for a single stored row into the wire `Transaction`, reused per leg. */
const decodeTransactionRow = Schema.decodeSync(TransactionFromRow);

/**
 * The flat row shape returned by the transfer-candidates self-join: every column
 * of the debit leg aliased `f_*`, every column of the credit leg aliased `t_*`,
 * plus the integer `daysApart`. A pragmatic mirror of {@link TransactionRow}
 * twice over — the transform below splits it back into two nested `Transaction`s.
 */
const TransferCandidateRow = Schema.Struct({
	f_id: Schema.Number,
	f_accountId: Schema.Number,
	f_date: Schema.String,
	f_amount: Schema.Number,
	f_rawIssuerString: Schema.String,
	f_issuerId: Schema.NullOr(Schema.Number),
	f_categoryId: Schema.NullOr(Schema.Number),
	f_manualCategory: Schema.Number,
	f_manualIssuer: Schema.Number,
	f_isRefund: Schema.Number,
	f_linkedRefundId: Schema.NullOr(Schema.Number),
	f_transferGroupId: Schema.NullOr(Schema.Number),
	f_anomalyFlags: Schema.NullOr(Schema.String),
	f_isDuplicateExcluded: Schema.Number,
	f_duplicateNote: Schema.NullOr(Schema.String),
	f_excludedFromRecap: Schema.Number,
	f_manualExcluded: Schema.Number,
	f_notes: Schema.NullOr(Schema.String),
	f_importedAt: Schema.String,
	f_importMonth: Schema.String,
	f_importBatchId: Schema.NullOr(Schema.String),
	t_id: Schema.Number,
	t_accountId: Schema.Number,
	t_date: Schema.String,
	t_amount: Schema.Number,
	t_rawIssuerString: Schema.String,
	t_issuerId: Schema.NullOr(Schema.Number),
	t_categoryId: Schema.NullOr(Schema.Number),
	t_manualCategory: Schema.Number,
	t_manualIssuer: Schema.Number,
	t_isRefund: Schema.Number,
	t_linkedRefundId: Schema.NullOr(Schema.Number),
	t_transferGroupId: Schema.NullOr(Schema.Number),
	t_anomalyFlags: Schema.NullOr(Schema.String),
	t_isDuplicateExcluded: Schema.Number,
	t_duplicateNote: Schema.NullOr(Schema.String),
	t_excludedFromRecap: Schema.Number,
	t_manualExcluded: Schema.Number,
	t_notes: Schema.NullOr(Schema.String),
	t_importedAt: Schema.String,
	t_importMonth: Schema.String,
	t_importBatchId: Schema.NullOr(Schema.String),
	daysApart: Schema.Number,
});

/**
 * Fold one aliased half of a candidate join row (the `f_*` or `t_*` columns)
 * into the wire {@link Transaction}, reusing {@link TransactionFromRow}'s
 * null→absent / 0-1→boolean / JSON folds. `pick` strips the prefix; the result
 * is a fully-decoded `Transaction` for one leg of the pair.
 */
const legFromRow = (
	row: typeof TransferCandidateRow.Type,
	prefix: "f" | "t",
): Transaction => {
	const pick = (col: string) =>
		row[`${prefix}_${col}` as keyof typeof row] as never;
	return decodeTransactionRow({
		id: pick("id"),
		accountId: pick("accountId"),
		date: pick("date"),
		amount: pick("amount"),
		rawIssuerString: pick("rawIssuerString"),
		issuerId: pick("issuerId"),
		categoryId: pick("categoryId"),
		manualCategory: pick("manualCategory"),
		manualIssuer: pick("manualIssuer"),
		isRefund: pick("isRefund"),
		linkedRefundId: pick("linkedRefundId"),
		transferGroupId: pick("transferGroupId"),
		anomalyFlags: pick("anomalyFlags"),
		isDuplicateExcluded: pick("isDuplicateExcluded"),
		duplicateNote: pick("duplicateNote"),
		excludedFromRecap: pick("excludedFromRecap"),
		manualExcluded: pick("manualExcluded"),
		notes: pick("notes"),
		importedAt: pick("importedAt"),
		importMonth: pick("importMonth"),
		importBatchId: pick("importBatchId"),
	});
};

/** Assemble a wire {@link TransferCandidate} from one aliased join row. */
const candidateFromRow = (
	row: typeof TransferCandidateRow.Type,
): TransferCandidate =>
	new TransferCandidate({
		from: legFromRow(row, "f"),
		to: legFromRow(row, "t"),
		daysApart: row.daysApart,
	});

/**
 * A `count` result: the filtered row `count` and the signed net `total` (the
 * `SUM(amount)` over the same set, `COALESCE`d to 0 when empty). Both are driven
 * by one filter object so they can never disagree (ADR 0002).
 */
const CountResult = Schema.Struct({
	count: Schema.Number,
	total: Schema.Number,
});

/**
 * The composable filter set, decoded + branded at the HTTP boundary
 * (`TransactionFilters`). Every field optional; all present ones combine with
 * `AND`. `startDate`/`endDate` are inclusive bounds on `date`.
 */
type Filters = {
	accountId?: number;
	issuerId?: number;
	categoryId?: number | ReadonlyArray<number>;
	linkedRefundId?: number;
	transferGroupId?: number;
	importMonth?: string;
	importBatchId?: string;
	startDate?: Date;
	endDate?: Date;
	isRefund?: boolean;
	isDuplicateExcluded?: boolean;
	excludedFromRecap?: boolean;
	search?: string;
	uncurated?: boolean;
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
	manualCategory: number;
	manualIssuer: number;
	isRefund: number;
	linkedRefundId: number | null;
	transferGroupId: number | null;
	anomalyFlags: string | null;
	isDuplicateExcluded: number;
	duplicateNote: string | null;
	excludedFromRecap: number;
	manualExcluded: number;
	notes: string | null;
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

			// The **derived** category expression (model A / ADR 0002): a manual row
			// keeps its own stored `categoryId`; a non-manual row reads its issuer's
			// `defaultCategoryId` (null when unmatched or the issuer has no default).
			// One fragment, reused by the read projection, the count, AND the category
			// filter — so the read and the filter can never disagree (the drift ADR
			// 0002 records). Requires the `issuers` LEFT JOIN (`readFrom`) in scope.
			const derivedCategory = sql`CASE WHEN t.manualCategory = 1 THEN t.categoryId ELSE i.defaultCategoryId END`;

			// **Excluded from recap** (issues #67/#69, ADR 0008), defined ONCE beside
			// the expression it mirrors and reused by the read projection AND the
			// filter, so the two can never disagree — the ADR 0002 drift, on a second
			// field. Same shape as `derivedCategory`, over the same `issuers` LEFT
			// JOIN: a row the user decided about (`manualExcluded`) keeps its own
			// stored flag, any other row inherits its issuer's default. So a
			// transaction imported under an excluded issuer is excluded the moment it
			// lands — nothing to re-run — and un-excluding an issuer cannot clobber a
			// deliberate per-row decision in either direction.
			//
			// `COALESCE(i.excludedFromRecap, 0)` is where the LEFT JOIN's `NULL`
			// lands: a row with no issuer (or an issuer predating migration 0019) has
			// nothing to inherit, so it *counts*. Without it the read would decode a
			// `NULL` into a non-nullable column and `WHERE … = 0` would drop every
			// issuer-less row from the "counted only" view — neither side of the
			// filter would list it.
			const recapExclusion = sql`CASE WHEN t.manualExcluded = 1 THEN t.excludedFromRecap ELSE COALESCE(i.excludedFromRecap, 0) END`;

			// The same expression under different table aliases, for the two
			// self-join projections below (`suggestTransfers`, `transferCandidates`):
			// each leg reads through its OWN issuer. Kept as one generator rather
			// than three hand-written copies — a candidate is the same row the list
			// projects, so the two reads must never disagree about whether it counts.
			const recapExclusionFor = (row: "c" | "f", issuer: "ci" | "fi") =>
				sql`CASE WHEN ${sql.literal(row)}.manualExcluded = 1 THEN ${sql.literal(row)}.excludedFromRecap ELSE COALESCE(${sql.literal(issuer)}.excludedFromRecap, 0) END`;

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
				// Filter on the DERIVED category, not the stored column (ADR 0002): an
				// issuer-categorised row (the common case) must match, not only a
				// hand-overridden one. The filter accepts a **set** — a folder page
				// lists all its leaves in one query; an empty set matches nothing.
				if (f.categoryId !== undefined) {
					const ids = Array.isArray(f.categoryId)
						? f.categoryId
						: [f.categoryId];
					conditions.push(
						ids.length === 0
							? sql`1 = 0`
							: sql`${derivedCategory} IN ${sql.in(ids)}`,
					);
				}
				if (f.linkedRefundId !== undefined)
					conditions.push(sql`t.linkedRefundId = ${f.linkedRefundId}`);
				// Transfer-group membership (PRD #48): narrows to the legs of one
				// internal transfer. Mirrors `linkedRefundId`, rides its own index.
				if (f.transferGroupId !== undefined)
					conditions.push(sql`t.transferGroupId = ${f.transferGroupId}`);
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
				// Recap exclusion (issue #67): filtered through the SAME fragment the
				// projection reads (ADR 0008), never a second copy of the rule — that
				// is exactly how the category filter once dropped every issuer-derived
				// row while looking like it worked.
				if (f.excludedFromRecap !== undefined)
					conditions.push(
						sql`${recapExclusion} = ${f.excludedFromRecap ? 1 : 0}`,
					);
				// Free-text search (#40): a case-insensitive substring matched against
				// the union of every human-readable field of a row — raw issuer text,
				// the joined issuer name (`i.name`, from `readFrom`'s LEFT JOIN), the
				// notes, and the amount rendered as text (so "6.99" finds that price).
				// A blank/whitespace-only term contributes no predicate. `\` escapes
				// the LIKE metachars `%` `_` so a user typing them means them literally.
				const search = f.search?.trim();
				if (search) {
					// Escape the LIKE metachars `%` `_` (backslash first, so the escape
					// char itself is escaped) so a user typing them means them literally;
					// pair every LIKE with `ESCAPE '\'`.
					const like = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
					const contains = (col: Fragment) =>
						sql`${col} LIKE ${like} ESCAPE '\\'`;
					// Match the amount as the UI renders it: two fraction digits and no
					// sign (debits and credits both show a bare figure), so "6.99" finds
					// a -6.99 debit and "42.50" finds a 42.5 amount. `,`→`.` lets a user
					// type the fr-FR decimal comma. `printf('%.2f', abs(...))` mirrors the
					// formatter's `minimumFractionDigits: 2` without its grouping/symbol.
					const amountLike = `%${search
						.replace(",", ".")
						.replace(/[\\%_]/g, "\\$&")}%`;
					conditions.push(
						sql`(${contains(sql`t.rawIssuerString`)} OR ${contains(sql`i.name`)} OR ${contains(sql`t.notes`)} OR printf('%.2f', abs(t.amount)) LIKE ${amountLike} ESCAPE '\\')`,
					);
				}
				// Curation state: a row is *uncurated* when nothing on it has been
				// reviewed — no issuer, no derived category, no note. Built from the
				// same `derivedCategory` fragment the projection uses, so a row
				// categorised through its issuer counts as curated here exactly as it
				// renders as categorised there. `trim(t.notes) = ''` matches the
				// table's own `notes.trim() === ""`, so a whitespace-only note is not
				// curation. `false` asks for the complement — rows with at least one
				// of the three.
				//
				// An **excluded from recap** row is exempt from the whole question
				// (issue #70, ADR 0008): its money is deliberately outside every
				// total, so no amount of curating it moves a number — it is not a
				// to-do, and calling it "done" would be just as wrong. So exclusion is
				// an AND on BOTH polarities rather than a term inside the negated
				// predicate: neither the uncurated view nor its complement lists an
				// excluded row. Unlike the `excludedFromRecap` filter — whose two
				// halves are exhaustive views of the table — these two are views of
				// *curation work*, and an excluded row has none either way. Read
				// through the shared `recapExclusion` fragment, so a row excluded by
				// inheritance is exempt exactly like a hand-flagged one; a check
				// against the stored column would let the inherited half back in.
				if (f.uncurated !== undefined) {
					const isUncurated = sql`(t.issuerId IS NULL AND ${derivedCategory} IS NULL AND (t.notes IS NULL OR trim(t.notes) = ''))`;
					conditions.push(sql`${recapExclusion} = 0`);
					conditions.push(f.uncurated ? isUncurated : sql`NOT ${isUncurated}`);
				}
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
			// every stored transaction column is read verbatim except **two**, both
			// read *through* the row's issuer — `categoryId` and `excludedFromRecap`.
			// A non-manual row takes its issuer's `defaultCategoryId` (LEFT JOIN
			// `issuers`, `null` when unmatched or the issuer has no default) and its
			// `excludedFromRecap` default; a `manualCategory` / `manualExcluded` row
			// keeps its own stored value (manual wins). Derivation is query-time only
			// — no column is written — so re-categorising or excluding an issuer
			// reclassifies its whole history at once. Reads go through this; writes
			// (`RETURNING *`) echo the stored row verbatim, and the internal
			// `storedByIdQuery` reads the raw row so an update's merge never persists
			// a derived value.
			const readColumns = sql`t.id, t.accountId, t.date, t.amount, t.rawIssuerString, t.issuerId, ${derivedCategory} AS categoryId, t.manualCategory, t.manualIssuer, t.isRefund, t.linkedRefundId, t.transferGroupId, t.anomalyFlags, t.isDuplicateExcluded, t.duplicateNote, ${recapExclusion} AS excludedFromRecap, t.manualExcluded, t.notes, t.importedAt, t.importMonth, t.importBatchId`;
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

			// Count + signed net total over the filtered set. It carries the SAME
			// `issuers` LEFT JOIN (`readFrom`) as the list — the join the old count
			// query lacked, without which a category filter couldn't reach the derived
			// value (ADR 0002). `SUM(amount)` is signed and net (a refund's positive
			// amount cancels the purchase); `COALESCE(…, 0)` keeps an empty set at 0
			// rather than SQL `NULL`.
			const countQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<Filters>,
				Result: CountResult,
				execute: (f) =>
					sql`SELECT COUNT(*) AS count, COALESCE(SUM(t.amount), 0) AS total ${readFrom} ${whereClause(f)}`,
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

			// Internal-transfer counterpart suggestions (PRD #48), computed in SQL so
			// they see the WHOLE dataset — not just a loaded page, the limit of the
			// client-side scan. A self-join against the target row `t`: a candidate
			// `c` is a counterpart when it is a **different row in a different
			// account**, its amount is the **exact negation** of the target's to the
			// cent (`ROUND(amount*100)` — floats are never compared directly, the same
			// discipline the value-matcher and `link-transfer` use; equality against
			// the negated value bakes in "opposite sign, equal magnitude" in one
			// predicate), it is **eligible** (not already grouped, not a refund and not
			// refund-paired), and its `date` is within `TRANSFER_DATE_WINDOW_DAYS` of
			// the target's (`julianday` parses the ISO TEXT `date`; `ABS(Δ) <= N`
			// windows both directions). The projection mirrors `readColumns` but reads
			// the CANDIDATE's columns and its OWN issuer's derived category *and*
			// derived recap exclusion (LEFT JOIN `issuers ci`) — a candidate is the
			// same row the list projects, so the two reads must agree about whether it
			// counts. Ordered nearest-date first, then id, so the closest match
			// leads. The target's own eligibility is checked in the method, not here —
			// an ineligible target simply never runs this query.
			const suggestTransfersQuery = SqlSchema.findAll({
				Request: TransactionId,
				Result: TransactionFromRow,
				execute: (id) =>
					sql`SELECT c.id, c.accountId, c.date, c.amount, c.rawIssuerString, c.issuerId, CASE WHEN c.manualCategory = 1 THEN c.categoryId ELSE ci.defaultCategoryId END AS categoryId, c.manualCategory, c.manualIssuer, c.isRefund, c.linkedRefundId, c.transferGroupId, c.anomalyFlags, c.isDuplicateExcluded, c.duplicateNote, ${recapExclusionFor("c", "ci")} AS excludedFromRecap, c.manualExcluded, c.notes, c.importedAt, c.importMonth, c.importBatchId
						FROM transactions t
						JOIN transactions c
							ON c.id <> t.id
							AND c.accountId <> t.accountId
							AND ROUND(c.amount * 100) = -ROUND(t.amount * 100)
							AND c.transferGroupId IS NULL
							AND c.isRefund = 0
							AND c.linkedRefundId IS NULL
							AND ABS(julianday(c.date) - julianday(t.date)) <= ${TRANSFER_DATE_WINDOW_DAYS}
						LEFT JOIN issuers ci ON c.issuerId = ci.id
						WHERE t.id = ${id}
						ORDER BY ABS(julianday(c.date) - julianday(t.date)), c.id`,
			});

			// Every DETECTED (not-yet-confirmed) internal-transfer pair across the
			// WHOLE dataset (PRD #48) — the Transfers page's data source, computed in
			// one SQL self-join rather than N per-row calls. The debit leg `f`
			// (amount < 0) is joined to its credit leg `c` (amount > 0) of the exact
			// negated magnitude to the cent, a **different account**, both **eligible**
			// (ungrouped, non-refund), and dated within `TRANSFER_DATE_WINDOW_DAYS`.
			// Orienting by sign — `f` is always the debit, `c` always the credit — is
			// what makes each real pair surface **exactly once** (the mirror row, with
			// the credit as `f`, fails `f.amount < 0`), so no client-side dedup is
			// needed. `daysApart` is the whole-day gap (`CAST(... AS INTEGER)` truncates
			// the julian delta). Each leg reads its OWN issuer's derived category and
			// derived recap exclusion (two LEFT JOINs, `fi`/`ci`), so a leg reads the
			// same here as in the list. Ordered closest-date first, then by the leg ids
			// for a stable page. The projection aliases every column `f_*` / `t_*` so
			// the flat row decodes into the two nested `Transaction`s below.
			const candidateColumns = (
				a: "f" | "c",
				issuerAlias: "fi" | "ci",
				prefix: "f" | "t",
			) =>
				sql`${sql.literal(a)}.id AS ${sql.literal(prefix)}_id, ${sql.literal(a)}.accountId AS ${sql.literal(prefix)}_accountId, ${sql.literal(a)}.date AS ${sql.literal(prefix)}_date, ${sql.literal(a)}.amount AS ${sql.literal(prefix)}_amount, ${sql.literal(a)}.rawIssuerString AS ${sql.literal(prefix)}_rawIssuerString, ${sql.literal(a)}.issuerId AS ${sql.literal(prefix)}_issuerId, CASE WHEN ${sql.literal(a)}.manualCategory = 1 THEN ${sql.literal(a)}.categoryId ELSE ${sql.literal(issuerAlias)}.defaultCategoryId END AS ${sql.literal(prefix)}_categoryId, ${sql.literal(a)}.manualCategory AS ${sql.literal(prefix)}_manualCategory, ${sql.literal(a)}.manualIssuer AS ${sql.literal(prefix)}_manualIssuer, ${sql.literal(a)}.isRefund AS ${sql.literal(prefix)}_isRefund, ${sql.literal(a)}.linkedRefundId AS ${sql.literal(prefix)}_linkedRefundId, ${sql.literal(a)}.transferGroupId AS ${sql.literal(prefix)}_transferGroupId, ${sql.literal(a)}.anomalyFlags AS ${sql.literal(prefix)}_anomalyFlags, ${sql.literal(a)}.isDuplicateExcluded AS ${sql.literal(prefix)}_isDuplicateExcluded, ${sql.literal(a)}.duplicateNote AS ${sql.literal(prefix)}_duplicateNote, ${recapExclusionFor(a, issuerAlias)} AS ${sql.literal(prefix)}_excludedFromRecap, ${sql.literal(a)}.manualExcluded AS ${sql.literal(prefix)}_manualExcluded, ${sql.literal(a)}.notes AS ${sql.literal(prefix)}_notes, ${sql.literal(a)}.importedAt AS ${sql.literal(prefix)}_importedAt, ${sql.literal(a)}.importMonth AS ${sql.literal(prefix)}_importMonth, ${sql.literal(a)}.importBatchId AS ${sql.literal(prefix)}_importBatchId`;

			const transferCandidatesQuery = SqlSchema.findAll({
				Request: Schema.Void,
				Result: TransferCandidateRow,
				execute: () =>
					sql`SELECT ${candidateColumns("f", "fi", "f")}, ${candidateColumns("c", "ci", "t")}, CAST(ABS(julianday(c.date) - julianday(f.date)) AS INTEGER) AS daysApart
						FROM transactions f
						JOIN transactions c
							ON f.amount < 0
							AND c.amount > 0
							AND ROUND(c.amount * 100) = -ROUND(f.amount * 100)
							AND c.accountId <> f.accountId
							AND f.transferGroupId IS NULL
							AND f.isRefund = 0
							AND f.linkedRefundId IS NULL
							AND c.transferGroupId IS NULL
							AND c.isRefund = 0
							AND c.linkedRefundId IS NULL
							AND ABS(julianday(c.date) - julianday(f.date)) <= ${TRANSFER_DATE_WINDOW_DAYS}
						LEFT JOIN issuers fi ON f.issuerId = fi.id
						LEFT JOIN issuers ci ON c.issuerId = ci.id
						ORDER BY ABS(julianday(c.date) - julianday(f.date)), f.id, c.id`,
			});

			// Reads a set of ids in one statement (partial existence allowed — the
			// result holds only the ids that exist, order is arbitrary).
			const bulkGetQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ReadonlyArray<number>>,
				Result: TransactionFromRow,
				execute: (ids) =>
					sql`SELECT ${readColumns} ${readFrom} WHERE ${sql.in("t.id", ids)}`,
			});

			// One indexed existence probe of a category's children — the
			// childlessness test for the Leaf-assignable invariant (ADR 0003). A row
			// means the category has children (a folder, unassignable); none means it
			// is childless (a leaf, assignable) at any depth. Rides
			// `idx_categories_parentId`. Mirrors the issuer repo's guard.
			const hasChildrenQuery = SqlSchema.findOne({
				Request: Schema.Number,
				Result: Schema.Struct({ one: Schema.Number }),
				execute: (id) =>
					sql`SELECT 1 AS one FROM categories WHERE parentId = ${id} LIMIT 1`,
			});

			// The folders among a set of category ids — the batch childlessness test
			// a bulk payload runs in **one** query, not one per row (ADR 0003). Each
			// id it returns is some row's parent (a folder); an empty result means
			// every id is childless or unknown.
			const foldersInQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ReadonlyArray<number>>,
				Result: Schema.Struct({ id: Schema.Number }),
				execute: (ids) =>
					sql`SELECT DISTINCT parentId AS id FROM categories WHERE ${sql.in("parentId", ids)}`,
			});

			/**
			 * The Leaf-assignable invariant (ADR 0003) at the transactions door: a
			 * `categoryId` must be an assignable **leaf** (a category with no
			 * children), never a **folder** — the same corruption, arriving through a
			 * different door than the issuer default. Assignability is childlessness,
			 * not root-ness: a childless node is a leaf at *any* depth. Absent
			 * (`undefined`) or `null` skips the check; an unknown id is left to pass
			 * (no FK exists — policing missing rows is not this invariant's job).
			 * Enforced on both a manual and a non-manual write: a folder id stored
			 * today becomes live the moment the row is flipped manual.
			 */
			const assertLeaf = (
				categoryId: number | null | undefined,
			): Effect.Effect<void, CategoryNotLeaf> =>
				categoryId == null
					? Effect.void
					: hasChildrenQuery(categoryId).pipe(
							orDieSql,
							Effect.flatMap((found) =>
								Option.isSome(found)
									? Effect.fail(new CategoryNotLeaf({ categoryId }))
									: Effect.void,
							),
						);

			// Batch guard for a bulk payload: resolve every distinct categoryId's
			// leaf/folder status in **one** query (ADR 0003), failing on the first
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
							Effect.flatMap((rows) => {
								const folder = rows[0];
								return folder === undefined
									? Effect.void
									: Effect.fail(new CategoryNotLeaf({ categoryId: folder.id }));
							}),
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
				manualCategory: t.manualCategory ? 1 : 0,
				manualIssuer: t.manualIssuer ? 1 : 0,
				isRefund: t.isRefund ? 1 : 0,
				linkedRefundId: t.linkedRefundId ?? null,
				transferGroupId: t.transferGroupId ?? null,
				anomalyFlags:
					t.anomalyFlags !== undefined
						? Schema.encodeSync(AnomalyFlagsJson)(t.anomalyFlags)
						: null,
				isDuplicateExcluded: t.isDuplicateExcluded ? 1 : 0,
				duplicateNote: t.duplicateNote ?? null,
				excludedFromRecap: t.excludedFromRecap ? 1 : 0,
				manualExcluded: t.manualExcluded ? 1 : 0,
				notes: t.notes ?? null,
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

			/**
			 * Auto-dissolve undersized transfer groups (PRD #48, issue #52). Given the
			 * `transferGroupId`s of just-deleted legs, clear the column on every group
			 * that now holds **fewer than 2** surviving legs — the survivor reverts to a
			 * normal transaction (counting as spend again), never left dangling as a
			 * one-sided "transfer". A single sub-select `UPDATE` covers all affected
			 * groups; the deduped id set feeds it, and an empty set touches no DB
			 * (`sql.in([])` would render an invalid `IN ()`). Idempotent: a group whose
			 * every leg was deleted (0 survivors, `< 2`) simply matches no rows.
			 */
			const dissolveUndersizedGroups = (
				groupIds: ReadonlyArray<number>,
			): Effect.Effect<void> => {
				const groups = [...new Set(groupIds)];
				return groups.length === 0
					? Effect.void
					: sql`UPDATE transactions SET transferGroupId = NULL WHERE transferGroupId IN (
							SELECT transferGroupId FROM transactions
							WHERE ${sql.in("transferGroupId", groups)}
							GROUP BY transferGroupId HAVING COUNT(*) < 2
						)`.pipe(orDieSql, Effect.asVoid);
			};

			// A delete that also auto-dissolves transfer groups (PRD #48, issue #52):
			// the statement must `DELETE ... RETURNING id, transferGroupId`, so every
			// deleted leg's group is checked and any that drops below 2 legs has its
			// survivor(s) cleared — one shared cleanup no delete path can skip. sqlite's
			// `RETURNING` yields one row per deleted row, so its length is the exact
			// affected count (taxonomy §5). The `SqlError` isn't client-actionable →
			// dies as a 500 ({@link orDieSql}).
			const deleteAndDissolve = <E, R>(
				statement: Effect.Effect<
					ReadonlyArray<{ id: number; transferGroupId: number | null }>,
					E,
					R
				>,
			) =>
				statement.pipe(
					orDieSql,
					Effect.flatMap((rows) =>
						dissolveUndersizedGroups(
							rows.flatMap((r) =>
								r.transferGroupId !== null ? [r.transferGroupId] : [],
							),
						).pipe(Effect.as({ count: rows.length })),
					),
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

			/**
			 * Suggest the counterpart legs of an internal transfer for one row
			 * (PRD #48). 404s an unknown id (via `getStoredById`). An **ineligible**
			 * target — already grouped, a refund, refund-paired, or zero-amount —
			 * yields an empty array without touching the suggestion query: there is
			 * nothing to net against, and the client shows the group's legs (or
			 * nothing) instead. The eligibility gate mirrors the web util's
			 * `isTransferEligible` + the `amount !== 0` guard, and the SQL enforces the
			 * *candidate* side of the same rule — so the pairing the user confirms will
			 * pass `link-transfer`'s re-validation.
			 */
			const suggestTransfers = (
				id: typeof TransactionId.Type,
			): Effect.Effect<ReadonlyArray<Transaction>, NotFound> =>
				getStoredById(id).pipe(
					Effect.flatMap((target) =>
						target.transferGroupId !== undefined ||
						target.isRefund === true ||
						target.linkedRefundId !== undefined ||
						target.amount === 0
							? Effect.succeed([] as ReadonlyArray<Transaction>)
							: suggestTransfersQuery(id).pipe(orDieSql),
					),
				);

			/**
			 * Every detected internal-transfer pair across the whole dataset (PRD
			 * #48) — the Transfers page's data source. Runs the one self-join and maps
			 * each flat row into a {@link TransferCandidate} (two nested `Transaction`s
			 * + the whole-day gap). Read-only and side-effect-free: a pair is a
			 * *suggestion*, confirmed only when the user links it.
			 */
			const transferCandidates = (): Effect.Effect<
				ReadonlyArray<TransferCandidate>
			> =>
				transferCandidatesQuery().pipe(
					Effect.map((rows) => rows.map(candidateFromRow)),
					orDieSql,
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

			// Single delete: 404 if missing (via `getStoredById`), then delete and
			// auto-dissolve the deleted leg's transfer group if it drops below 2 legs
			// (PRD #48, issue #52) — the survivor of a two-leg group reverts to spend.
			const remove = (id: typeof TransactionId.Type) =>
				getStoredById(id).pipe(
					Effect.flatMap((current) =>
						orDieSql(sql`DELETE FROM transactions WHERE id = ${id}`).pipe(
							Effect.andThen(
								dissolveUndersizedGroups(
									current.transferGroupId !== undefined
										? [current.transferGroupId]
										: [],
								),
							),
						),
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
					: deleteAndDissolve(
							sql<{
								id: number;
								transferGroupId: number | null;
							}>`DELETE FROM transactions WHERE ${sql.in("id", ids)} RETURNING id, transferGroupId`,
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
				deleteAndDissolve(
					sql<{
						id: number;
						transferGroupId: number | null;
					}>`DELETE FROM transactions WHERE accountId = ${accountId} AND importMonth = ${importMonth} RETURNING id, transferGroupId`,
				);

			const deleteByImportBatch = (batchId: string) =>
				deleteAndDissolve(
					sql<{
						id: number;
						transferGroupId: number | null;
					}>`DELETE FROM transactions WHERE importBatchId = ${batchId} RETURNING id, transferGroupId`,
				);

			/**
			 * Group a set of transactions as one **internal transfer** (PRD #48), the
			 * atomic multi-row operation the generic single-row `update` cannot
			 * express. Validates the set server-side and, on success, stamps every leg
			 * with `min(ids)` as the `transferGroupId` (the group id *is* one of the
			 * legs' ids). Fails `TransferInvalid` — never a partial write — on any of:
			 *
			 * - `too-few-legs` — fewer than 2 **distinct** legs (a set, so duplicate
			 *   ids collapse first; a lone id can't form a transfer).
			 * - `unknown-id` — some id doesn't exist (checked by count, since only real
			 *   rows come back from the read).
			 * - `already-grouped` — some leg already carries a `transferGroupId`.
			 * - `is-refund` — some leg is a refund (`isRefund` or `linkedRefundId`).
			 * - `unbalanced` — the legs' amounts don't sum to zero, compared in integer
			 *   cents (`Σ round(amount·100) === 0`) — amounts are float euros, never
			 *   compared as floats (the same discipline the value-matcher uses).
			 *
			 * The "≥2 distinct accounts" property is deliberately NOT enforced (a
			 * suggestion-only heuristic — a same-account zero-sum group the user
			 * confirmed is harmless to net out).
			 */
			const linkTransfer = (
				rawIds: ReadonlyArray<typeof TransactionId.Type>,
			): Effect.Effect<{ count: number }, TransferInvalid> =>
				Effect.gen(function* () {
					const ids = [...new Set(rawIds)];
					if (ids.length < 2)
						return yield* Effect.fail(
							new TransferInvalid({ reason: "too-few-legs" }),
						);

					const legs = yield* bulkGetQuery(ids).pipe(orDieSql);
					if (legs.length !== ids.length)
						return yield* Effect.fail(
							new TransferInvalid({ reason: "unknown-id" }),
						);
					if (legs.some((l) => l.transferGroupId !== undefined))
						return yield* Effect.fail(
							new TransferInvalid({ reason: "already-grouped" }),
						);
					if (legs.some((l) => l.isRefund || l.linkedRefundId !== undefined))
						return yield* Effect.fail(
							new TransferInvalid({ reason: "is-refund" }),
						);

					// Sum in integer cents — amounts are float euros, never compared as
					// floats (round to the cent first, exactly like the value-matcher).
					const cents = legs.reduce(
						(sum, l) => sum + Math.round(l.amount * 100),
						0,
					);
					if (cents !== 0)
						return yield* Effect.fail(
							new TransferInvalid({ reason: "unbalanced" }),
						);

					// The group id is the smallest leg id — deterministic, no counter
					// infrastructure needed. Every leg (the anchor included) gets it.
					const groupId = Math.min(...ids);
					const rows = yield* sql<{
						id: number;
					}>`UPDATE transactions SET transferGroupId = ${groupId} WHERE ${sql.in("id", ids)} RETURNING id`.pipe(
						orDieSql,
					);
					return { count: rows.length };
				});

			/**
			 * Dissolve a transfer group (PRD #48): clear `transferGroupId` on every leg
			 * carrying the given group id, reverting them to normal transactions (they
			 * count as spend again). Returns the count cleared — 0 for an unknown group
			 * id (idempotent, no error; there is nothing to fail on).
			 */
			const unlinkTransfer = (groupId: typeof TransactionId.Type) =>
				sql<{
					id: number;
				}>`UPDATE transactions SET transferGroupId = NULL WHERE transferGroupId = ${groupId} RETURNING id`.pipe(
					Effect.map((rows) => ({ count: rows.length })),
					orDieSql,
				);

			return {
				list,
				count,
				getById,
				suggestTransfers,
				transferCandidates,
				create,
				update,
				remove,
				bulkCreate,
				bulkPut,
				bulkDelete,
				bulkGet,
				deleteByAccountMonth,
				deleteByImportBatch,
				linkTransfer,
				unlinkTransfer,
			} as const;
		}),
	},
) {}
