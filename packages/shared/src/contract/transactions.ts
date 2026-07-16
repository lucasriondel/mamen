import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { AnomalyFlag } from "./anomaly";
import { BooleanFromString, CategoryNotLeaf, NotFound } from "./errors";
import {
	AccountId,
	CategoryId,
	IssuerId,
	numFromStr,
	TransactionId,
} from "./ids";
import { Paged, Pagination } from "./pagination";

/** Transaction entity — the wire shape returned by every transactions endpoint. */
export class Transaction extends Schema.Class<Transaction>("Transaction")({
	id: TransactionId,
	accountId: AccountId,
	date: Schema.Date,
	amount: Schema.Number,
	rawIssuerString: Schema.String,
	issuerId: Schema.optional(IssuerId),
	categoryId: Schema.optional(CategoryId),
	manualCategory: Schema.optional(Schema.Boolean),
	manualIssuer: Schema.optional(Schema.Boolean),
	isRefund: Schema.optional(Schema.Boolean),
	linkedRefundId: Schema.optional(TransactionId),
	anomalyFlags: Schema.optional(Schema.Array(AnomalyFlag)),
	isDuplicateExcluded: Schema.optional(Schema.Boolean),
	duplicateNote: Schema.optional(Schema.String),
	importedAt: Schema.Date,
	importMonth: Schema.String, // "YYYY-MM"
	importBatchId: Schema.optional(Schema.String),
}) {}

/**
 * Create payload — the server assigns `id`. Every other field is caller-provided
 * (faithful port: the old adapter accepted `importedAt` on the record, so it is
 * kept here rather than server-stamped; contract §5 permits either).
 */
export const TransactionCreate = Schema.Struct({
	accountId: Transaction.fields.accountId,
	date: Transaction.fields.date,
	amount: Transaction.fields.amount,
	rawIssuerString: Transaction.fields.rawIssuerString,
	issuerId: Transaction.fields.issuerId,
	categoryId: Transaction.fields.categoryId,
	manualCategory: Transaction.fields.manualCategory,
	manualIssuer: Transaction.fields.manualIssuer,
	isRefund: Transaction.fields.isRefund,
	linkedRefundId: Transaction.fields.linkedRefundId,
	anomalyFlags: Transaction.fields.anomalyFlags,
	isDuplicateExcluded: Transaction.fields.isDuplicateExcluded,
	duplicateNote: Transaction.fields.duplicateNote,
	importedAt: Transaction.fields.importedAt,
	importMonth: Transaction.fields.importMonth,
	importBatchId: Transaction.fields.importBatchId,
});
export type TransactionCreate = typeof TransactionCreate.Type;

/** Update payload — every field optional (partial update). */
export const TransactionUpdate = Schema.partial(TransactionCreate);
export type TransactionUpdate = typeof TransactionUpdate.Type;

/**
 * The `categoryId` filter — a single id **or a set** (ADR 0002). A folder's
 * category page lists all of its leaves' transactions in one query, so the
 * filter accepts several category ids at once (repeated `?categoryId=`), while a
 * leaf page still passes a lone id. A single query value decodes to one branded
 * id; a repeated one to an array — the repository normalises both to a set. The
 * filter matches the **derived** category, not the stored column (ADR 0002).
 */
export const CategoryIdFilter = Schema.Union(
	numFromStr(CategoryId),
	Schema.Array(numFromStr(CategoryId)),
);

/**
 * The composable filter set (contract §2.5) — the core redesign. Every field is
 * optional and `AND`-combined; the old 9-branch either/or fan-out (where
 * `accountId` dominated and every other filter was unreachable) is gone. `count`
 * reuses the identical set; `list` adds `Pagination` + `orderBy`/`direction`.
 * Branded-id filters decode a query string via `numFromStr`; the two boolean
 * filters via `BooleanFromString`; `startDate`/`endDate` are inclusive bounds on
 * the entity's `date` (encoded to ISO strings in the URL). `categoryId` accepts
 * a **set** (see {@link CategoryIdFilter}) and matches the derived category.
 */
export const TransactionFilters = {
	accountId: Schema.optional(numFromStr(AccountId)),
	issuerId: Schema.optional(numFromStr(IssuerId)),
	categoryId: Schema.optional(CategoryIdFilter),
	linkedRefundId: Schema.optional(numFromStr(TransactionId)),
	importMonth: Schema.optional(Schema.String), // "YYYY-MM"
	importBatchId: Schema.optional(Schema.String),
	startDate: Schema.optional(Schema.Date), // inclusive lower bound on `date`
	endDate: Schema.optional(Schema.Date), // inclusive upper bound on `date`
	isRefund: Schema.optional(BooleanFromString),
	isDuplicateExcluded: Schema.optional(BooleanFromString),
} as const;

/**
 * The `list` ordering params: `orderBy: "date"` orders by `date`, `direction`
 * defaults `desc` (faithful to the old `getAllOrderedByDate` default). Separate
 * from {@link TransactionFilters} because `count` — which takes the identical
 * filter set — has no meaningful ordering.
 */
export const TransactionListOrder = {
	orderBy: Schema.optional(Schema.Literal("date")),
	direction: Schema.optionalWith(Schema.Literal("asc", "desc"), {
		default: () => "desc" as const,
	}),
} as const;

/**
 * `count` success body — the full filtered row `count` plus a signed, net
 * `total` (ADR 0002). The total covers the **whole filtered set**, not a page,
 * and follows the same filter object as the count, so a category page's number
 * can never disagree with its list. Signed per the amount sign convention: a
 * refunded purchase nets to zero, an income category totals positive.
 */
export const TransactionCount = Schema.Struct({
	count: Schema.Number,
	total: Schema.Number,
});

/** Bulk-create payload — `{ records }`, one row created per element (201, ids generated). */
export const TransactionBulkCreate = Schema.Struct({
	records: Schema.Array(TransactionCreate),
});
export type TransactionBulkCreate = typeof TransactionBulkCreate.Type;

/**
 * Bulk-put payload — `{ records }` of **full** `Transaction`s (id-carrying); each
 * is upserted by id (faithful port of the old `INSERT OR REPLACE`). Returns
 * `{ count }` per taxonomy §5, not the rows (the client already holds them).
 */
export const TransactionBulkPut = Schema.Struct({
	records: Schema.Array(Transaction),
});
export type TransactionBulkPut = typeof TransactionBulkPut.Type;

/**
 * Bulk id-list payload — `{ ids }`, shared by `bulkDelete` and `bulkGet`. Both
 * stay `POST` (the id list rides in the body, not a long `?ids=` query;
 * taxonomy §5 flags bulk-get's POST-as-read exception).
 */
export const TransactionBulkIds = Schema.Struct({
	ids: Schema.Array(TransactionId),
});
export type TransactionBulkIds = typeof TransactionBulkIds.Type;

/**
 * `bulkDelete` / `bulkPut` / `deleteBy*` success body — rows affected. A bulk
 * delete deliberately breaks the "delete → 204" rule (taxonomy §5): the deleted
 * count is useful information (some ids may not exist).
 */
export const TransactionAffected = Schema.Struct({ count: Schema.Number });

/**
 * `deleteByAccountMonth` query params — both **required** (a targeted bulk
 * delete, not a filtered list): `accountId` decodes a branded id from the query
 * string, `importMonth` is the `"YYYY-MM"` string. A missing param fails decode
 * → `HttpApiDecodeError (400)`.
 */
export const TransactionByAccountMonth = Schema.Struct({
	accountId: numFromStr(AccountId),
	importMonth: Schema.String,
});

/**
 * Transactions group (contract §2.5), prefix `/transactions` — the **core**:
 * composable `list`/`count`, `getById`, `create`, `update`, `remove`. The bulk +
 * targeted-delete endpoints (bulkCreate/bulkPut/bulkDelete/bulkGet,
 * deleteByAccountMonth, deleteByImportBatch) are added to this same group by the
 * follow-up "Port transactions bulk" ticket, which builds on this handler layer.
 *
 * No transaction field has a DB uniqueness constraint, so writes declare no
 * `Conflict`. `getById`/`update`/`remove` 404 on a missing id; `remove` → 204.
 * `count` shares `list`'s filter set minus pagination/order.
 *
 * `create`/`bulkCreate`/`update` declare `CategoryNotLeaf`: a transaction's
 * `categoryId` must be an assignable **leaf** (a category with no children),
 * never a **folder** — the **Leaf-assignable invariant** (ADR 0003), at any
 * depth, the same one the issuer door enforces. A folder-categorised row hangs
 * money off a node the category rollup visits but never counts, understating the
 * total with no error on screen.
 */
export class TransactionsGroup extends HttpApiGroup.make("transactions")
	.add(
		HttpApiEndpoint.get("list")`/transactions`
			.setUrlParams(
				Schema.Struct({
					...Pagination,
					...TransactionFilters,
					...TransactionListOrder,
				}),
			)
			.addSuccess(Paged(Transaction)),
	)
	.add(
		HttpApiEndpoint.get("count")`/transactions/count`
			.setUrlParams(Schema.Struct(TransactionFilters))
			.addSuccess(TransactionCount),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}`
			.addSuccess(Transaction)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post("create")`/transactions`
			.setPayload(TransactionCreate)
			.addSuccess(Transaction, { status: 201 })
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.post("bulkCreate")`/transactions/bulk`
			.setPayload(TransactionBulkCreate)
			.addSuccess(Schema.Array(Transaction), { status: 201 })
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}`
			.setPayload(TransactionUpdate)
			.addSuccess(Transaction)
			.addError(NotFound)
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.put("bulkPut")`/transactions/bulk-put`
			.setPayload(TransactionBulkPut)
			.addSuccess(TransactionAffected),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound),
	)
	// The Matching Rule preview's per-row "remove manual issuer" action
	// (PRD #8 story 10): clears the row's manual issuer, then re-derives it
	// against the current rule set — it becomes unmatched (or claimed by an
	// existing rule) and, crucially, rule-eligible again. Returns the updated row.
	.add(
		HttpApiEndpoint.post(
			"removeManualIssuer",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}/remove-manual-issuer`
			.addSuccess(Transaction)
			.addError(NotFound),
	)
	// `bulkDelete` / `bulkGet` stay POST — the id list rides in the body.
	.add(
		HttpApiEndpoint.post("bulkDelete")`/transactions/bulk-delete`
			.setPayload(TransactionBulkIds)
			.addSuccess(TransactionAffected),
	)
	.add(
		HttpApiEndpoint.post("bulkGet")`/transactions/bulk-get`
			.setPayload(TransactionBulkIds)
			.addSuccess(Schema.Array(Transaction)),
	)
	// Targeted bulk deletes — both required-param, both return the deleted count.
	.add(
		HttpApiEndpoint.del("deleteByAccountMonth")`/transactions/by-account-month`
			.setUrlParams(TransactionByAccountMonth)
			.addSuccess(TransactionAffected),
	)
	.add(
		HttpApiEndpoint.del(
			"deleteByImportBatch",
		)`/transactions/by-import-batch/${HttpApiSchema.param("batchId", Schema.String)}`.addSuccess(
			TransactionAffected,
		),
	)
	.annotateContext(OpenApi.annotations({ title: "Transactions" })) {}
