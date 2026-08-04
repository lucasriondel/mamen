import { SqlClient, SqlSchema } from "@effect/sql";
import type { Fragment } from "@effect/sql/Statement";
import {
	type AccountId,
	AnomalyFlag,
	CategoryNotLeaf,
	NotFound,
	PagedTransactions,
	RecapCategoryBucket,
	RecapIssuerBucket,
	RecapTransfers,
	TRANSFER_DATE_WINDOW_DAYS,
	Transaction,
	type TransactionCreate,
	TransactionId,
	TransactionKind,
	type TransactionUpdate,
	TransferCandidate,
	TransferInvalid,
} from "@mamen/shared/contract";
import { Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";
import { bundleWrites } from "./bundle-writes";
import { recapPredicates } from "./recap-predicate";

/**
 * A stored transaction row. The seven "boolean" columns (`manualCategory`,
 * `manualIssuer`, `isRefund`, `isDuplicateExcluded`, `excludedFromRecap`,
 * `manualExcluded`, `manualDate`) are sqlite `INTEGER`
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
	// `kind` is `TEXT DEFAULT 'bank'` (migration 0020) and every write states it,
	// so it is never null in practice — read as nullable anyway so a row written
	// by something that predates the column reads as the `bank` row it is rather
	// than failing the whole page's decode.
	kind: Schema.NullOr(TransactionKind),
	bundleId: Schema.NullOr(Schema.Number),
	manualDate: Schema.Number,
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
 * A flag list as the column holds it: `null` when there are none, so a row that
 * carries no anomaly reads back with the field *absent* — the same shape a row
 * that was never flagged has, rather than an empty array meaning the same thing
 * a second way.
 */
const encodeFlags = (flags: ReadonlyArray<AnomalyFlag>): string | null =>
	flags.length === 0 ? null : Schema.encodeSync(AnomalyFlagsJson)(flags);

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
			// Absent decodes to `bank` through the entity's own default, so the fold
			// is the same null → absent one every other optional column uses.
			...(row.kind !== null ? { kind: row.kind } : {}),
			...(row.bundleId !== null ? { bundleId: row.bundleId } : {}),
			...(row.manualDate === 1 ? { manualDate: true } : {}),
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
			// The entity defaults `kind` on decode, so the encoded side is where it can
			// still be absent — a row is stored as the `bank` row it is.
			kind: t.kind ?? "bank",
			bundleId: t.bundleId ?? null,
			manualDate: t.manualDate ? 1 : 0,
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
	f_kind: Schema.NullOr(TransactionKind),
	f_bundleId: Schema.NullOr(Schema.Number),
	f_manualDate: Schema.Number,
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
	t_kind: Schema.NullOr(TransactionKind),
	t_bundleId: Schema.NullOr(Schema.Number),
	t_manualDate: Schema.Number,
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
		kind: pick("kind"),
		bundleId: pick("bundleId"),
		manualDate: pick("manualDate"),
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
	accountId?: number | ReadonlyArray<number>;
	issuerId?: number;
	categoryId?: number | ReadonlyArray<number>;
	linkedRefundId?: number;
	transferGroupId?: number;
	bundleId?: number;
	kind?: TransactionKind;
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

/**
 * The **recap** filter (issue #71) — a period and an account selection, and
 * nothing else. A subset of {@link Filters} rather than a type of its own, so the
 * recap runs through the same `buildConditions` every other read does: which rows
 * *count* is the server's `countsTowardRecap` predicate, never something a caller
 * composes.
 */
type RecapFilter = Pick<Filters, "accountId" | "startDate" | "endDate">;

/** The full `list` filter — the composable set plus pagination + ordering. */
type ListFilter = Filters & {
	limit: number;
	offset: number;
	orderBy?: "date";
	direction: "asc" | "desc";
};

/**
 * A plain null-mapped write row (the shape bound into INSERT/UPDATE). Exported
 * as a type only, for {@link bundleWrites}' `insertRow` dep: the bundle module
 * builds a **bundle parent**'s row, and this file stays the one place that says
 * what a stored row's columns are. Type-only, so there is no import cycle at
 * runtime — the dependency goes repository → bundle-writes in every value.
 */
export type WriteRow = {
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
	kind: TransactionKind;
	bundleId: number | null;
	manualDate: number;
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
 *
 * What is NOT here: the parts of the domain that change for their own reasons.
 * `bundle-derivation.ts` holds what a **bundle parent**'s number is,
 * `recap-predicate.ts` the fragments the recap is computed over, and
 * `bundle-writes.ts` the **bundle write paths** (issue #83) — each read and
 * tested without this closure around it, each delegated to from below. This file
 * stays the one place that says how a transaction row is stored and read.
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

			// The recap's fragments — **excluded from recap** (issues #67/#69, ADR
			// 0008), the **bundle-membership** rule (#68) and the single
			// `countsTowardRecap` predicate they compose into (#71) — all built in
			// {@link recapPredicates}, over this file's `t`/`i` aliases. They live in
			// a module of their own (issue #80) so the predicate can be run alone in a
			// test, against rows, instead of only ever through the WHERE the list
			// builds around it. `recapExclusion` is not recap-only: the read
			// projection and the `excludedFromRecap` filter read the SAME fragment, so
			// the row a filter selects and the row a projection shows can never
			// disagree about being excluded.
			const {
				recapExclusion,
				isTransferLeg,
				isNotBundleMember,
				isRecapExcluded,
				countsTowardRecap,
			} = recapPredicates(sql);

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
				// One account or a **set** of them: the recap's account picker is
				// multi-select and sums the whole selection in ONE query (issue #71) —
				// fanning out one query per account and merging the pages client-side
				// is exactly what the old scan-and-reduce did. Same shape as the
				// category filter below; an empty set matches nothing.
				if (f.accountId !== undefined) {
					const ids = Array.isArray(f.accountId)
						? f.accountId
						: [f.accountId as number];
					conditions.push(
						ids.length === 0 ? sql`1 = 0` : sql`t.accountId IN ${sql.in(ids)}`,
					);
				}
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
				// **Bundle** membership (issue #68). Asked for, it narrows to one
				// bundle's members — the only way `list` reaches a member at all.
				// NOT asked for, it *hides* every bundled row: the **bundle parent**
				// already accounts for them, so listing both would show the same money
				// twice, in the rows and in the signed `total` the same WHERE drives.
				// The default belongs here, not in each caller, so no surface can
				// forget it (the drift ADR 0002 records, on the grouping axis) — and it
				// is the SAME `isNotBundleMember` fragment `countsTowardRecap` states
				// the rule with, not a second copy of it: the recap no longer *depends*
				// on this default (issue #80), but it must not come to disagree with it
				// either.
				conditions.push(
					f.bundleId !== undefined
						? sql`t.bundleId = ${f.bundleId}`
						: isNotBundleMember,
				);
				// The row's **kind** (issue #74): `bundle` narrows to the parents, which
				// is how a row is offered the bundles it may join. Orthogonal to
				// `bundleId` above — that asks whose members, this asks which parents.
				// A `bank` row is stored with the column set (never NULL), but read it
				// COALESCEd anyway so a row predating migration 0020 answers as the
				// bank row it is rather than falling out of both halves of the filter.
				if (f.kind !== undefined)
					conditions.push(sql`COALESCE(t.kind, 'bank') = ${f.kind}`);
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
			const readColumns = sql`t.id, t.accountId, t.date, t.amount, t.rawIssuerString, t.issuerId, ${derivedCategory} AS categoryId, t.manualCategory, t.manualIssuer, t.isRefund, t.linkedRefundId, t.transferGroupId, t.kind, t.bundleId, t.manualDate, t.anomalyFlags, t.isDuplicateExcluded, t.duplicateNote, ${recapExclusion} AS excludedFromRecap, t.manualExcluded, t.notes, t.importedAt, t.importMonth, t.importBatchId`;
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

			// The recap's WHERE: the caller's own filters (period + accounts) AND the
			// single `countsTowardRecap` predicate AND "this is spending" — money OUT,
			// so only debits. Income nets a bucket down by never being counted, which
			// is what makes a fully-refunded purchase read as its own charge and not
			// as a negative bucket. `buildConditions` always contributes at least the
			// bundle-member clause, so the fragment list is never empty — but since
			// issue #80 the recap no longer *leans* on that: `countsTowardRecap` states
			// the bundle rule itself, so this WHERE would hold members out even if the
			// caller's conditions were empty. The two say the same thing through the
			// same fragment, so sqlite folds the repeat and the plan is unchanged.
			const spendWhere = (f: Filters) =>
				sql`WHERE ${sql.and([...buildConditions(f), countsTowardRecap, sql`t.amount < 0`])}`;

			// Money is summed in **integer cents** and divided back once, never added
			// as floats: three 0.10 € rows added as REALs give 0.30000000000000004,
			// and a month of small amounts drifts visibly. The same discipline
			// `linkTransfer` and `createBundle` apply to comparing and summing money.
			// `ROUND(-t.amount * 100)` is a whole number of cents held exactly in a
			// REAL, so `SUM` over them is exact.
			const spentCents = sql`SUM(ROUND(-t.amount * 100))`;

			// Spend per **issuer** over the whole filtered set — no page, no cap. The
			// `null` group is the rows with no issuer: unattributed spend is still
			// spend, so it comes back as its own bucket for the page to label
			// *Unassigned* rather than being dropped from the total.
			const recapByIssuerQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<Filters>,
				Result: RecapIssuerBucket,
				execute: (f) =>
					sql`SELECT t.issuerId AS id, ${spentCents} / 100.0 AS spent, COUNT(*) AS count ${readFrom} ${spendWhere(f)} GROUP BY t.issuerId ORDER BY spent DESC, t.issuerId`,
			});

			// Spend per **derived** category (ADR 0002), through the same fragment the
			// projection and the category filter read: a row categorised through its
			// issuer buckets under that category, not under Unassigned. Grouping by
			// the expression rather than by `t.categoryId` is the whole point.
			const recapByCategoryQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<Filters>,
				Result: RecapCategoryBucket,
				execute: (f) =>
					sql`SELECT ${derivedCategory} AS id, ${spentCents} / 100.0 AS spent, COUNT(*) AS count ${readFrom} ${spendWhere(f)} GROUP BY ${derivedCategory} ORDER BY spent DESC, id`,
			});

			// The transfer legs netted out of the breakdowns, summarised (PRD #48):
			// `total` sums the DEBIT legs' magnitudes, so a clean -30/+30 pair reads
			// as the 30 that moved rather than a net ~0 or a doubled 60; `count` is
			// every leg in the period, both sides. Legs that are excluded or
			// duplicate-excluded are left out of this too — they are out of the
			// arithmetic entirely, and unlike a transfer there is nothing to report.
			//
			// The complement half of `countsTowardRecap`, so it states its own row
			// rule the same way (issue #80): the bundle clause is named here rather
			// than inherited from the list default. It refuses nothing today — the two
			// groupings are mutually exclusive (#75), so a leg carries no `bundleId` —
			// which is exactly why it is worth saying instead of relying on a default
			// that is not this query's to keep.
			const recapTransfersQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<Filters>,
				Result: RecapTransfers,
				execute: (f) =>
					sql`SELECT COALESCE(SUM(CASE WHEN t.amount < 0 THEN ROUND(-t.amount * 100) ELSE 0 END), 0) / 100.0 AS total, COUNT(*) AS count ${readFrom} WHERE ${sql.and([...buildConditions(f), isTransferLeg, sql`NOT ${isRecapExcluded}`, isNotBundleMember])}`,
			});

			// The months the data covers, newest first — the period picker's options.
			// `substr(t.date, 1, 7)` is the `"YYYY-MM"` prefix of the ISO TEXT `date`,
			// so the options are derived from the same field every period bound is
			// (offering *import* months while filtering on the date is how the month
			// and year views came to disagree). Bundle members are hidden like
			// everywhere else — through the shared `isNotBundleMember` fragment, so
			// this is the same rule and not a third hand-written copy of it;
			// `countsTowardRecap` is deliberately NOT applied — a month exists because
			// rows are dated in it, and hiding one whose money all happens to be
			// excluded would leave the user unable to look at it.
			const recapPeriodsQuery = SqlSchema.findAll({
				Request: Schema.Void,
				Result: Schema.Struct({ month: Schema.String }),
				execute: () =>
					sql`SELECT DISTINCT substr(t.date, 1, 7) AS month FROM transactions t WHERE ${isNotBundleMember} ORDER BY month DESC`,
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

			// **Transfer-eligible**, under any of the self-join aliases below — ONE
			// definition of "this row could be a leg", so the two suggestion queries
			// cannot drift from each other or from `linkTransfer`'s re-validation: a
			// pairing the user is offered must be one the confirm action accepts.
			// A row is ineligible when it is already grouped, when it is a refund or
			// refund-paired (a refund nets within one account; grouping it would net
			// the same money out twice), and — issue #75 — when it belongs to a
			// **bundle** or IS a **bundle parent**: the two groupings are mutually
			// exclusive, so offering a bundled row could only earn a 422. `kind` is
			// COALESCEd because a row written before the column reads as `bank`.
			const transferEligibleFor = (a: "c" | "f") =>
				sql`${sql.literal(a)}.transferGroupId IS NULL AND ${sql.literal(a)}.isRefund = 0 AND ${sql.literal(a)}.linkedRefundId IS NULL AND ${sql.literal(a)}.bundleId IS NULL AND COALESCE(${sql.literal(a)}.kind, 'bank') <> 'bundle'`;

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
					sql`SELECT c.id, c.accountId, c.date, c.amount, c.rawIssuerString, c.issuerId, CASE WHEN c.manualCategory = 1 THEN c.categoryId ELSE ci.defaultCategoryId END AS categoryId, c.manualCategory, c.manualIssuer, c.isRefund, c.linkedRefundId, c.transferGroupId, c.kind, c.bundleId, c.manualDate, c.anomalyFlags, c.isDuplicateExcluded, c.duplicateNote, ${recapExclusionFor("c", "ci")} AS excludedFromRecap, c.manualExcluded, c.notes, c.importedAt, c.importMonth, c.importBatchId
						FROM transactions t
						JOIN transactions c
							ON c.id <> t.id
							AND c.accountId <> t.accountId
							AND ROUND(c.amount * 100) = -ROUND(t.amount * 100)
							AND ${transferEligibleFor("c")}
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
				sql`${sql.literal(a)}.id AS ${sql.literal(prefix)}_id, ${sql.literal(a)}.accountId AS ${sql.literal(prefix)}_accountId, ${sql.literal(a)}.date AS ${sql.literal(prefix)}_date, ${sql.literal(a)}.amount AS ${sql.literal(prefix)}_amount, ${sql.literal(a)}.rawIssuerString AS ${sql.literal(prefix)}_rawIssuerString, ${sql.literal(a)}.issuerId AS ${sql.literal(prefix)}_issuerId, CASE WHEN ${sql.literal(a)}.manualCategory = 1 THEN ${sql.literal(a)}.categoryId ELSE ${sql.literal(issuerAlias)}.defaultCategoryId END AS ${sql.literal(prefix)}_categoryId, ${sql.literal(a)}.manualCategory AS ${sql.literal(prefix)}_manualCategory, ${sql.literal(a)}.manualIssuer AS ${sql.literal(prefix)}_manualIssuer, ${sql.literal(a)}.isRefund AS ${sql.literal(prefix)}_isRefund, ${sql.literal(a)}.linkedRefundId AS ${sql.literal(prefix)}_linkedRefundId, ${sql.literal(a)}.transferGroupId AS ${sql.literal(prefix)}_transferGroupId, ${sql.literal(a)}.kind AS ${sql.literal(prefix)}_kind, ${sql.literal(a)}.bundleId AS ${sql.literal(prefix)}_bundleId, ${sql.literal(a)}.manualDate AS ${sql.literal(prefix)}_manualDate, ${sql.literal(a)}.anomalyFlags AS ${sql.literal(prefix)}_anomalyFlags, ${sql.literal(a)}.isDuplicateExcluded AS ${sql.literal(prefix)}_isDuplicateExcluded, ${sql.literal(a)}.duplicateNote AS ${sql.literal(prefix)}_duplicateNote, ${recapExclusionFor(a, issuerAlias)} AS ${sql.literal(prefix)}_excludedFromRecap, ${sql.literal(a)}.manualExcluded AS ${sql.literal(prefix)}_manualExcluded, ${sql.literal(a)}.notes AS ${sql.literal(prefix)}_notes, ${sql.literal(a)}.importedAt AS ${sql.literal(prefix)}_importedAt, ${sql.literal(a)}.importMonth AS ${sql.literal(prefix)}_importMonth, ${sql.literal(a)}.importBatchId AS ${sql.literal(prefix)}_importBatchId`;

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
							AND ${transferEligibleFor("f")}
							AND ${transferEligibleFor("c")}
							AND ABS(julianday(c.date) - julianday(f.date)) <= ${TRANSFER_DATE_WINDOW_DAYS}
						LEFT JOIN issuers fi ON f.issuerId = fi.id
						LEFT JOIN issuers ci ON c.issuerId = ci.id
						ORDER BY ABS(julianday(c.date) - julianday(f.date)), f.id, c.id`,
			});

			// The **bundle members** of a set of **bundle parents** (issue #73) — the
			// rows a page's parents stand for, fetched in ONE statement for the whole
			// page rather than one per parent, so expanding a parent in the table
			// needs no round-trip at all. Reads through the same `readColumns` /
			// `readFrom` projection as the list, so a member expanded under its
			// parent shows the same derived category and recap exclusion it would
			// show anywhere else. Ordered date-then-id: the reading order of the rows
			// that make up the parent's amount.
			const bundleMembersQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ReadonlyArray<number>>,
				Result: TransactionFromRow,
				execute: (parentIds) =>
					sql`SELECT ${readColumns} ${readFrom} WHERE ${sql.in("t.bundleId", parentIds)} ORDER BY t.date, t.id`,
			});

			// The **raw stored** rows of ONE bundle's members (issue #74) — the input
			// to the recompute below, and the count the auto-dissolve rule reads. Raw
			// rather than through `readColumns` on purpose: the derivation wants what
			// the rows *hold* (amount, date, account, statement month), and a derived
			// projection would join `issuers` for two columns nothing here looks at.
			const bundleMembersOfQuery = SqlSchema.findAll({
				Request: TransactionId,
				Result: TransactionFromRow,
				execute: (parentId) =>
					sql`SELECT * FROM transactions WHERE bundleId = ${parentId}`,
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
				// Absent on a plain create payload → a `bank` row, the only kind a
				// caller ever posts: a bundle parent is written by `createBundle`,
				// which builds its row itself.
				kind: t.kind ?? "bank",
				bundleId: t.bundleId ?? null,
				manualDate: t.manualDate ? 1 : 0,
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
			 * The **bundle write paths** (issue #83): create, add member, remove
			 * member, dissolve, and the parent recompute every membership change ends
			 * in. They live in {@link bundleWrites} rather than here — this file had
			 * grown to ~1900 lines and changed for listing, recap, transfer and import
			 * reasons as well as bundling — and are handed the table reads and writes
			 * they are expressed over: what a **bundle** is belongs there, how a
			 * transaction is *stored* stays here.
			 *
			 * Destructured at the top of the write half so every caller below reaches
			 * the same object: the endpoints, and equally the delete routes, whose
			 * cleanups run `releaseBundleMembers` / `recomputeBundleParent` /
			 * `dissolveBundlesTouching`. One recompute and one dissolve in the system,
			 * exactly as before the move.
			 */
			const {
				releaseBundleMembers,
				dissolveBundle,
				bundlesTouching,
				dissolveBundlesTouching,
				recomputeBundleParent,
				createBundle,
				addBundleMember,
				removeBundleMember,
			} = bundleWrites({
				sql,
				storedById: (id) => storedByIdQuery(id).pipe(orDieSql),
				storedMembersOf: (parentId) =>
					bundleMembersOfQuery(parentId).pipe(orDieSql),
				readByIds: (ids) => bulkGetQuery(ids).pipe(orDieSql),
				// The projected read, for returning a row the caller just changed. Its
				// `NotFound` dies: the row was read (or written) a statement ago, so a
				// miss here is a defect, not something the client can act on.
				readById: (id) => getById(id).pipe(Effect.orDie),
				insertRow: (row) => insertQuery(row).pipe(orDieSql),
				encodeFlags,
			});

			/** The rows one re-imported statement replaces: one account, one month. */
			const accountMonthScope = (
				accountId: typeof AccountId.Type,
				importMonth: string,
			): Fragment =>
				sql`t.accountId = ${accountId} AND t.importMonth = ${importMonth}`;

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

			/**
			 * What a delete has to know about the rows it removed for the grouping
			 * cleanups below: which transfer group each leg was in, and which side of a
			 * bundle it was on.
			 */
			type DeletedRow = {
				id: number;
				transferGroupId: number | null;
				bundleId: number | null;
				kind: string | null;
			};

			/**
			 * The cleanup EVERY delete path runs, so no route can leave a grouping
			 * half-standing. Both groupings are handled here, in the one place, rather
			 * than by each caller (issue #52 for transfers, issue #74 for bundles):
			 *
			 * - a deleted **bundle parent** releases its members — the parent stands for
			 *   them, it does not own them, so deleting it dissolves the bundle rather
			 *   than deleting three bank rows;
			 * - a deleted **bundle member** leaves a parent whose amount no longer
			 *   matches the rows it stands for, so that parent is recomputed (and
			 *   auto-dissolved if fewer than two members remain);
			 * - a deleted **transfer leg** may drop its group below two legs, clearing
			 *   the survivor(s).
			 *
			 * Parents deleted in the same breath are dropped from the recompute set:
			 * their members were just released, and there is no row left to update.
			 */
			const cleanupAfterDelete = (
				rows: ReadonlyArray<DeletedRow>,
			): Effect.Effect<void> =>
				Effect.gen(function* () {
					const deletedParents = rows.flatMap((r) =>
						r.kind === "bundle" ? [r.id] : [],
					);
					yield* releaseBundleMembers(deletedParents);

					const gone = new Set(deletedParents);
					const orphanedParents = [
						...new Set(
							rows.flatMap((r) => (r.bundleId !== null ? [r.bundleId] : [])),
						),
					].filter((id) => !gone.has(id));
					yield* Effect.forEach(
						orphanedParents,
						(id) => recomputeBundleParent(TransactionId.make(id)),
						{ discard: true },
					);

					yield* dissolveUndersizedGroups(
						rows.flatMap((r) =>
							r.transferGroupId !== null ? [r.transferGroupId] : [],
						),
					);
				});

			// A delete that also runs the shared grouping cleanup (PRD #48 issue #52,
			// issue #74): the statement must `DELETE ... RETURNING` the four columns
			// {@link DeletedRow} names, so every deleted row's transfer group and
			// bundle role are seen by {@link cleanupAfterDelete} — one cleanup no
			// delete path can skip. sqlite's `RETURNING` yields one row per deleted
			// row, so its length is the exact affected count (taxonomy §5). The
			// `SqlError` isn't client-actionable → dies as a 500 ({@link orDieSql}).
			const deleteAndDissolve = <E, R>(
				statement: Effect.Effect<ReadonlyArray<DeletedRow>, E, R>,
			) =>
				statement.pipe(
					orDieSql,
					Effect.flatMap((rows) =>
						cleanupAfterDelete(rows).pipe(Effect.as({ count: rows.length })),
					),
				);

			/**
			 * A page of transactions plus, since issue #73, the **bundle members** of
			 * whatever **bundle parents** that page contains — one extra statement for
			 * the whole page, and none at all for a page with no parent on it, so the
			 * table can expand a parent in place without a fetch per row.
			 *
			 * The members travel BESIDE `items`, never inside it: `items` is the
			 * top-level set that `total` counts and the signed `count` total sums, and
			 * a member added there would be counted twice — exactly what the
			 * `bundleId IS NULL` default in {@link buildConditions} exists to stop.
			 * They are scoped to the parents on this page, so the payload grows with
			 * the page rather than with the table.
			 */
			const list = (filter: ListFilter) =>
				Effect.all({
					items: listQuery(filter),
					total: countQuery(filter).pipe(Effect.map((r) => r.count)),
				}).pipe(
					Effect.bind("bundleMembers", ({ items }) => {
						const parentIds = items.flatMap((t) =>
							t.kind === "bundle" ? [t.id] : [],
						);
						return parentIds.length === 0
							? Effect.succeed([] as ReadonlyArray<Transaction>)
							: bundleMembersQuery(parentIds);
					}),
					Effect.map((paged) => PagedTransactions.make(paged)),
					orDieSql,
				);

			const count = (filter: Filters) => countQuery(filter).pipe(orDieSql);

			/**
			 * The **recap** (issue #71): spend for a period and an account selection,
			 * aggregated by issuer and by category **over the whole filtered set**.
			 *
			 * This replaces a client-side scan that listed up to a fixed number of
			 * rows per account and reduced them in the browser — past that cap the
			 * totals were simply wrong, and every exclusion rule had to be restated in
			 * that reducer alongside the SQL that already expressed it for the list.
			 * Here there is one predicate, `countsTowardRecap` ({@link recapPredicates}),
			 * defined once beside the derived-exclusion and bundle-membership fragments
			 * it is built from — and stating every clause itself (issue #80), so what
			 * reaches the recap is readable in one place rather than assembled from a
			 * predicate plus whichever defaults the surrounding WHERE happens to add.
			 *
			 * The three queries share one filter object, so the breakdowns and the
			 * transfer line can never be computed over different row sets.
			 */
			const recap = (filter: RecapFilter) =>
				Effect.all({
					byIssuer: recapByIssuerQuery(filter),
					byCategory: recapByCategoryQuery(filter),
					transfers: recapTransfersQuery(filter),
				}).pipe(orDieSql);

			/** Every `"YYYY-MM"` the data covers, newest first (the period picker). */
			const recapPeriods = () =>
				recapPeriodsQuery().pipe(
					Effect.map((rows) => ({ months: rows.map((r) => r.month) })),
					orDieSql,
				);

			const getById = (id: typeof TransactionId.Type) =>
				byIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, id)),
				);

			/**
			 * Suggest the counterpart legs of an internal transfer for one row
			 * (PRD #48). 404s an unknown id (via `getStoredById`). An **ineligible**
			 * target — already grouped, a refund, refund-paired, **bundled** (a member
			 * or a parent, issue #75), or zero-amount — yields an empty array without
			 * touching the suggestion query: there is nothing to net against, and the
			 * client shows the group's legs (or nothing) instead. The eligibility gate
			 * mirrors the web util's `isTransferEligible` + the `amount !== 0` guard,
			 * and {@link transferEligibleFor} enforces the *candidate* side of the same
			 * rule — so the pairing the user confirms will pass `link-transfer`'s
			 * re-validation.
			 */
			const suggestTransfers = (
				id: typeof TransactionId.Type,
			): Effect.Effect<ReadonlyArray<Transaction>, NotFound> =>
				getStoredById(id).pipe(
					Effect.flatMap((target) =>
						target.transferGroupId !== undefined ||
						target.isRefund === true ||
						target.linkedRefundId !== undefined ||
						// A bundled row (member or parent) can never be linked, so it is
						// never offered a counterpart either (issue #75).
						target.bundleId !== undefined ||
						target.kind === "bundle" ||
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

			// Single delete: 404 if missing (via `getStoredById`), then the shared
			// grouping cleanup (PRD #48 issue #52, issue #74) — the survivor of a
			// two-leg transfer reverts to spend, a deleted bundle parent releases its
			// members, and a deleted member's parent is recomputed. The stored row is
			// already in hand, so the deleted row's facts come from it rather than
			// from a `RETURNING` clause.
			const remove = (id: typeof TransactionId.Type) =>
				getStoredById(id).pipe(
					Effect.flatMap((current) =>
						orDieSql(sql`DELETE FROM transactions WHERE id = ${id}`).pipe(
							Effect.andThen(
								cleanupAfterDelete([
									{
										id: current.id,
										transferGroupId: current.transferGroupId ?? null,
										bundleId: current.bundleId ?? null,
										kind: current.kind ?? "bank",
									},
								]),
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
							sql<DeletedRow>`DELETE FROM transactions WHERE ${sql.in("id", ids)} RETURNING id, transferGroupId, bundleId, kind`,
						);

			// Read the given ids; only existing rows come back (partial existence),
			// so the result may be shorter than `ids`. Empty → `[]` without a query.
			const bulkGet = (ids: ReadonlyArray<typeof TransactionId.Type>) =>
				ids.length === 0
					? Effect.succeed([] as ReadonlyArray<Transaction>)
					: bulkGetQuery(ids).pipe(orDieSql);

			/**
			 * The targeted deletes behind the delete-then-reinsert shape: re-importing
			 * a statement (account + month) and dropping an import batch. Both take
			 * the same two steps in the same order (issue #77):
			 *
			 * 1. **dissolve** every bundle the scope touches, through the shared
			 *    {@link dissolveBundle} — the delete is unconditional and a bundle
			 *    parent is a row in this table like any other, so without this a
			 *    re-import wipes the parents and reinserts the members ungrouped, the
			 *    recap quietly reverting to the gross rows with nothing said;
			 * 2. **delete** the scope, which by then holds only ordinary rows.
			 *
			 * The count is therefore the **bank rows** the statement replaces: a
			 * parent inside the scope was already dissolved, and it was never a row
			 * the import produced. {@link bundleImpact} is the pre-flight of step 1,
			 * over the same scope fragment.
			 */
			const deleteScope = (scope: Fragment) =>
				dissolveBundlesTouching(scope).pipe(
					Effect.andThen(
						deleteAndDissolve(
							sql<DeletedRow>`DELETE FROM transactions AS t WHERE ${scope} RETURNING id, transferGroupId, bundleId, kind`,
						),
					),
				);

			// Targeted delete: both params required at the boundary. Returns the
			// deleted count (was `{ ok: true }` in the old server; taxonomy §5).
			const deleteByAccountMonth = (
				accountId: typeof AccountId.Type,
				importMonth: string,
			) => deleteScope(accountMonthScope(accountId, importMonth));

			const deleteByImportBatch = (batchId: string) =>
				deleteScope(sql`t.importBatchId = ${batchId}`);

			/**
			 * How many **bundles** committing an import for one account + month would
			 * dissolve — the pre-flight the import wizard shows before the user
			 * commits, so the bundling is never destroyed silently (issue #77).
			 *
			 * Read-only, and read through the SAME {@link bundlesTouching} the commit
			 * dissolves through, over the same scope fragment: the number on screen is
			 * the number of bundles that will go, not a second estimate of it. Counts
			 * bundles only *partly* inside the target, since re-importing takes their
			 * members whatever month or account the parent happens to sit in.
			 */
			const bundleImpact = (
				accountId: typeof AccountId.Type,
				importMonth: string,
			): Effect.Effect<{ count: number }> =>
				bundlesTouching(accountMonthScope(accountId, importMonth)).pipe(
					Effect.map((parentIds) => ({ count: parentIds.length })),
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
			 * - `is-bundled` — some leg belongs to a **bundle** or is a **bundle
			 *   parent** (issue #75): the two groupings are mutually exclusive.
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
					// The other half of bundle/transfer exclusivity (issue #75), read from
					// the transfer side. ONE reason covers both bundle roles because it is
					// one rule: a **member** would be netted out here while its parent
					// still displayed its share, and a **parent**'s amount is derived from
					// its members — so the zero sum validated just below could stop being
					// zero on the next membership change, with nothing said.
					if (legs.some((l) => l.bundleId !== undefined || l.kind === "bundle"))
						return yield* Effect.fail(
							new TransferInvalid({ reason: "is-bundled" }),
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
				recap,
				recapPeriods,
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
				bundleImpact,
				linkTransfer,
				unlinkTransfer,
				createBundle,
				addBundleMember,
				removeBundleMember,
				dissolveBundle,
			} as const;
		}),
	},
) {}
