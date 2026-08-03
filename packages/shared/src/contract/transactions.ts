import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { AnomalyFlag } from "./anomaly";
import {
	BooleanFromString,
	CategoryNotLeaf,
	NotFound,
	TransferInvalid,
} from "./errors";
import {
	AccountId,
	CategoryId,
	IssuerId,
	numFromStr,
	TransactionId,
} from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * The cap on a transaction's free-text `notes` (issue #38) — the one length
 * constraint on the entity, enforced in the schema below so an over-long note
 * fails decode (400) at the API boundary. Exported so the web editor can guide
 * the user to the same limit rather than restating the number and drifting.
 */
export const NOTES_MAX_LENGTH = 1000;

/**
 * The date window, in days, either side of a leg's date within which a
 * counterpart is considered "around the same time" for internal-transfer
 * suggestion (PRD #48). The **single source of truth** — the server's
 * `transfer-suggestions` self-join and the web suggestion util both read this
 * one constant, so their notions of "the surrounding days" can never drift.
 * Kept small so a suggestion reads as an obvious match rather than a
 * coincidence; the confirmed pairing is re-validated at `link-transfer`, so a
 * generous window would only dilute suggestions, never corrupt state.
 */
export const TRANSFER_DATE_WINDOW_DAYS = 5;

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
	/**
	 * Transfer-group membership (Internal transfers, PRD #48). Optional; absent
	 * means the row belongs to no internal transfer. When set, it is the group's
	 * id — the smallest transaction id among the legs — so every leg of one
	 * transfer carries the same value (the anchor leg's own id equals it). A
	 * `TransactionId`-branded value because the id *is* one of the legs' ids.
	 * Stored flat and FK-free, mirroring `linkedRefundId`; the link/unlink logic
	 * lands in a later slice — this only persists and reads the membership.
	 */
	transferGroupId: Schema.optional(TransactionId),
	anomalyFlags: Schema.optional(Schema.Array(AnomalyFlag)),
	isDuplicateExcluded: Schema.optional(Schema.Boolean),
	duplicateNote: Schema.optional(Schema.String),
	/**
	 * **Excluded from recap** (issue #67, ADR 0008) — the row does not count
	 * toward spend totals: an internal movement the **transfer group** feature
	 * never caught, a correction, a row the user has decided is noise. Optional;
	 * absent means the row counts. Excluded rows stay fully visible in the list —
	 * exclusion is about arithmetic, not visibility.
	 *
	 * Distinct from `isDuplicateExcluded`, which claims *this row is a duplicate
	 * of another* (a provenance fact) rather than *this row is not spending*.
	 */
	excludedFromRecap: Schema.optional(Schema.Boolean),
	/**
	 * Marks this row's `excludedFromRecap` as a **deliberate** decision, so it
	 * wins over the default its issuer will carry once issuer-level exclusion
	 * lands (#69) — `manualExcluded` stands to `excludedFromRecap` exactly as
	 * `manualCategory` stands to `categoryId` (ADR 0008). Set in *both*
	 * directions: forcing a row out of the recap and forcing one back in are both
	 * decisions an issuer default must not clobber. Introduced with the flag it
	 * qualifies so no later migration has to invent the distinction retroactively.
	 */
	manualExcluded: Schema.optional(Schema.Boolean),
	/**
	 * Free-text note the user records against a single transaction (issue #38).
	 * Optional; absent means no note. Capped at 1000 chars at the contract
	 * boundary, so an over-long note fails decode (400) rather than reaching the
	 * DB — the one constrained string on the entity. Searching it is #40's job,
	 * not carried here as a filter.
	 */
	notes: Schema.optional(
		Schema.String.pipe(Schema.maxLength(NOTES_MAX_LENGTH)),
	),
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
	transferGroupId: Transaction.fields.transferGroupId,
	anomalyFlags: Transaction.fields.anomalyFlags,
	isDuplicateExcluded: Transaction.fields.isDuplicateExcluded,
	duplicateNote: Transaction.fields.duplicateNote,
	excludedFromRecap: Transaction.fields.excludedFromRecap,
	manualExcluded: Transaction.fields.manualExcluded,
	notes: Transaction.fields.notes,
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
	// Transfer-group membership (PRD #48): returns only the legs of one internal
	// transfer, so the detail page can list a group's other legs and the table
	// can badge legs without client-side scanning. Mirrors `linkedRefundId`.
	transferGroupId: Schema.optional(numFromStr(TransactionId)),
	importMonth: Schema.optional(Schema.String), // "YYYY-MM"
	importBatchId: Schema.optional(Schema.String),
	startDate: Schema.optional(Schema.Date), // inclusive lower bound on `date`
	endDate: Schema.optional(Schema.Date), // inclusive upper bound on `date`
	isRefund: Schema.optional(BooleanFromString),
	isDuplicateExcluded: Schema.optional(BooleanFromString),
	// Recap exclusion (issue #67): `true` returns only the rows held out of spend
	// totals, `false` only those that count, absent both. Matched against the same
	// expression the projection reads (ADR 0008) — the guard against the ADR 0002
	// drift, where a filter on the stored column silently dropped every row
	// excluded by inheritance once #69 makes exclusion derivable through the issuer.
	excludedFromRecap: Schema.optional(BooleanFromString),
	// A free-text substring (case-insensitive) matched against the raw issuer
	// string, the assigned issuer's name, the notes, and the amount as displayed
	// (2 decimals, unsigned) — the union, so one box searches every human-readable
	// field of a row. AND-combined with the rest, like every sibling filter (#40).
	search: Schema.optional(Schema.String),
	// Curation state: `true` returns only rows nothing has been reviewed on —
	// no issuer, no *derived* category, no note. Derived, not stored: a row
	// categorised through its issuer counts as curated, exactly like the tint the
	// table paints those rows with. `false` returns only the complement (rows
	// with at least one of the three), absent returns both.
	// A row **excluded from recap** — by either route — is exempt from the whole
	// question (issue #70): curating it moves no total, so neither value returns
	// it. Unlike `excludedFromRecap` the two halves are therefore NOT exhaustive;
	// absent is how you ask for the whole table.
	uncurated: Schema.optional(BooleanFromString),
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
 * `link-transfer` payload — the set of transaction ids to group as one internal
 * transfer (PRD #48). Reuses the `{ ids }` shape of {@link TransactionBulkIds},
 * but is its own type so the two surfaces can evolve independently: the server
 * validates this set atomically (≥2 legs, all ids real, none already grouped,
 * none a refund, amounts summing to zero in cents), computes `min(ids)` as the
 * group id, and stamps every leg — the multi-row operation the generic
 * single-row update cannot express.
 */
export const TransferLink = Schema.Struct({
	ids: Schema.Array(TransactionId),
});
export type TransferLink = typeof TransferLink.Type;

/**
 * `unlink-transfer` payload — the group id (one of the legs' ids, the smallest)
 * whose membership is being dissolved. Clearing `transferGroupId` on every leg
 * of the group reverts them to normal transactions (they count as spend again).
 */
export const TransferUnlink = Schema.Struct({
	transferGroupId: TransactionId,
});
export type TransferUnlink = typeof TransferUnlink.Type;

/**
 * One **detected** (not yet confirmed) internal-transfer pair (PRD #48) — the
 * row shape of the Transfers page. `from` is always the debit leg (the money
 * leaving, a negative amount) and `to` the credit leg (the money arriving, a
 * positive amount) — the server orients them by sign so each real pair is
 * surfaced **exactly once** (never both A→B and B→A). `daysApart` is the whole
 * number of days between the two dates, so the UI can show "2 days apart" and
 * rank the closest matches first. Both legs are eligible and ungrouped by
 * construction; confirming a pair calls `link-transfer`, which re-validates it.
 */
export class TransferCandidate extends Schema.Class<TransferCandidate>(
	"TransferCandidate",
)({
	from: Transaction,
	to: Transaction,
	daysApart: Schema.Number,
}) {}

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
	// Every DETECTED (not yet confirmed) internal-transfer pair across the whole
	// dataset (PRD #48) — the Transfers page's data source. One SQL self-join
	// pairs each ungrouped, non-refund debit with its ungrouped, non-refund
	// credit of equal magnitude (to the cent), a different account, and a date
	// within `TRANSFER_DATE_WINDOW_DAYS`. Oriented by sign (`from` = debit, `to`
	// = credit) so each real pair is returned exactly once, never both ways.
	// Ordered closest-date first. A literal sub-path, declared before the `:id`
	// route so it is never shadowed by it.
	.add(
		HttpApiEndpoint.get(
			"transferCandidates",
		)`/transactions/transfer-candidates`.addSuccess(
			Schema.Array(TransferCandidate),
		),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}`
			.addSuccess(Transaction)
			.addError(NotFound),
	)
	// Suggest the counterpart legs of an internal transfer for one row (PRD
	// #48): the server scans the DB for rows with the opposite sign, an equal
	// magnitude to the cent, a different account, no existing transfer group, no
	// refund involvement, and a date within `TRANSFER_DATE_WINDOW_DAYS` of this
	// row's — the same rule the web suggestion util applies, run in SQL so it
	// sees the whole dataset (not just a loaded page). 404s an unknown id; an
	// **ineligible** row (already grouped, or a refund) yields an empty array —
	// there is nothing to suggest, which is not an error. Nearest-date first.
	.add(
		HttpApiEndpoint.get(
			"transferSuggestions",
		)`/transactions/${HttpApiSchema.param("id", numFromStr(TransactionId))}/transfer-suggestions`
			.addSuccess(Schema.Array(Transaction))
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
	// Link/unlink internal transfers (PRD #48), the atomic multi-row operations
	// the generic single-row `update` cannot express. `linkTransfer` validates
	// the set server-side and fails `TransferInvalid` (422) — a dedicated error,
	// not an overloaded `NotFound` — on any of: <2 legs, a non-zero cent sum, an
	// unknown id, a leg already grouped, or a refund leg. Both return the count
	// of legs stamped/cleared.
	.add(
		HttpApiEndpoint.post("linkTransfer")`/transactions/link-transfer`
			.setPayload(TransferLink)
			.addSuccess(TransactionAffected)
			.addError(TransferInvalid),
	)
	.add(
		HttpApiEndpoint.post("unlinkTransfer")`/transactions/unlink-transfer`
			.setPayload(TransferUnlink)
			.addSuccess(TransactionAffected),
	)
	.annotateContext(OpenApi.annotations({ title: "Transactions" })) {}
