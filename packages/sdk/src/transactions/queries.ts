import type {
	AccountId,
	CategoryId,
	IssuerId,
	TransactionBulkCreate,
	TransactionBulkPut,
	TransactionCreate,
	TransactionId,
	TransactionKind,
	TransactionUpdate,
} from "@mamen/shared/contract";
import {
	PaginationDefaults,
	type UNASSIGNED_FILTER,
} from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * The composable `list` filter — every field optional, `AND`-combined, mirroring
 * the contract's §2.5 redesign. `startDate`/`endDate` are inclusive `date`
 * bounds; `orderBy`/`direction` order the page (direction defaults `desc`).
 */
export type TransactionListParams = {
	limit?: number;
	offset?: number;
	/**
	 * One account id, or a **set** of them. The set form is what carries the recap
	 * page's multi-select selection into a drill-down (issue #86): a detail page
	 * whose account scope widened to every account would show rows the recap row it
	 * came from never counted.
	 */
	accountId?: AccountId | ReadonlyArray<AccountId>;
	/**
	 * One issuer id, or {@link UNASSIGNED_FILTER} for the rows no issuer is matched
	 * to — the recap's *Unassigned* by-issuer bucket (issue #86). Omitted means any.
	 */
	issuerId?: IssuerId | typeof UNASSIGNED_FILTER;
	/**
	 * One category id, a **set** of them (ADR 0002), or {@link UNASSIGNED_FILTER}.
	 * A leaf page passes a lone id; a folder page passes all of its leaves' ids so
	 * their transactions come back in one query. The filter matches the *derived*
	 * category, so it includes issuer-categorised rows, not only hand-overridden
	 * ones — and `"none"` therefore means "no category by either route" (#86).
	 */
	categoryId?:
		| CategoryId
		| ReadonlyArray<CategoryId>
		| typeof UNASSIGNED_FILTER;
	linkedRefundId?: TransactionId;
	/**
	 * Transfer-group membership (PRD #48) — narrows to the legs of one internal
	 * transfer, so a caller can query "the legs of group X". Mirrors
	 * `linkedRefundId`; the group id is one of the legs' `TransactionId`s.
	 */
	transferGroupId?: TransactionId;
	/**
	 * **Bundle** membership (issue #68) — narrows to the members of one bundle, so
	 * a parent can list what it stands for. Omitted, the list hides every bundled
	 * row: the parent already accounts for them, and showing both double-counts
	 * the rows *and* the signed total.
	 */
	bundleId?: TransactionId;
	/**
	 * The row's **kind** (issue #74). `"bundle"` narrows to the **bundle parents**
	 * — how the detail page offers a row the bundles it may join; `"bank"` to the
	 * real rows; omitted returns both. Orthogonal to `bundleId`: that asks whose
	 * members, this asks which rows are parents.
	 */
	kind?: TransactionKind;
	importMonth?: string;
	importBatchId?: string;
	startDate?: Date;
	endDate?: Date;
	isRefund?: boolean;
	isDuplicateExcluded?: boolean;
	/**
	 * **Excluded from recap** state (issue #67). `true` narrows to the rows held
	 * out of spend totals, `false` to the rows that count, omitted returns both.
	 * Matches the same expression the row's `excludedFromRecap` is read through
	 * (ADR 0008), so the filter and the flag on screen can never disagree.
	 */
	excludedFromRecap?: boolean;
	/** Free-text substring matched across issuer text/name, notes, amount (#40). */
	search?: string;
	/**
	 * Curation state. `true` narrows to rows nothing has been reviewed on — no
	 * issuer, no *derived* category, no note (the rows the table tints); `false`
	 * narrows to the complement; omitted returns both. A row **excluded from
	 * recap** is exempt from both (issue #70): curating it moves no total, so it
	 * is neither a to-do nor a curated row — only omitting the filter lists it.
	 */
	uncurated?: boolean;
	orderBy?: "date";
	direction?: "asc" | "desc";
};

/**
 * The **recap** params (issue #71) — a period and an account selection, and
 * nothing else. Which rows count toward spend is not a filter the caller
 * composes: the server applies one `countsTowardRecap` predicate (not a transfer
 * leg, not excluded, not duplicate-excluded, not a bundle member) so the client
 * never carries a second definition of it.
 *
 * `accountId` accepts a **set** — the recap's picker is multi-select and the
 * whole selection is summed in ONE request, not one per account. `startDate` /
 * `endDate` are inclusive bounds on the transaction **`date`**: every period
 * (month, year, all time) is that same bound, widened.
 */
export type RecapParams = {
	accountId?: AccountId | ReadonlyArray<AccountId>;
	startDate?: Date;
	endDate?: Date;
};

/**
 * The `bundleImpact` params (issue #77) — the statement about to be re-imported,
 * named exactly as `deleteByAccountMonth` names it. Both are required: this is a
 * pre-flight of one targeted delete, not a filtered read.
 */
export type BundleImpactParams = {
	accountId: AccountId;
	importMonth: string;
};

/** The `count` filter — the same composable set minus pagination + ordering. */
export type TransactionCountParams = Omit<
	TransactionListParams,
	"limit" | "offset" | "orderBy" | "direction"
>;

/** Query-key factory for the transactions resource. */
export const transactionKeys = {
	all: ["transactions"] as const,
	lists: () => [...transactionKeys.all, "list"] as const,
	list: (params: TransactionListParams) =>
		[...transactionKeys.lists(), params] as const,
	counts: () => [...transactionKeys.all, "count"] as const,
	count: (params: TransactionCountParams) =>
		[...transactionKeys.counts(), params] as const,
	details: () => [...transactionKeys.all, "detail"] as const,
	detail: (id: TransactionId) => [...transactionKeys.details(), id] as const,
	transferSuggestions: (id: TransactionId) =>
		[...transactionKeys.detail(id), "transfer-suggestions"] as const,
	transferCandidates: () =>
		[...transactionKeys.all, "transfer-candidates"] as const,
	recap: (params: RecapParams) =>
		[...transactionKeys.all, "recap", params] as const,
	recapPeriods: () => [...transactionKeys.all, "recap-periods"] as const,
	bundleImpact: (params: BundleImpactParams) =>
		[...transactionKeys.all, "bundle-impact", params] as const,
	bulkGet: (ids: ReadonlyArray<TransactionId>) =>
		[...transactionKeys.all, "bulk-get", ids] as const,
};

/** tanstack-query read options for the transactions resource. */
export const transactionQueries = {
	/**
	 * A page of transactions — `{ items, total, bundleMembers }`. `items` is the
	 * top-level set (bundle members hidden, per `bundleId` above) and `total` its
	 * full filtered count; `bundleMembers` (issue #73) carries the members of
	 * whatever **bundle parents** the page contains, so a parent can be expanded
	 * in place without a request of its own. It is reference data for the rows on
	 * screen — never rows of the page, and never part of any total.
	 */
	list: (params: TransactionListParams = {}) => {
		// `direction` has a schema default (`desc`) but the derived client types it
		// as required in the request, so fill it here alongside the pagination
		// window — one source of truth for the default sort order.
		const urlParams = {
			...PaginationDefaults,
			direction: "desc" as const,
			...params,
		};
		return queryOptions({
			queryKey: transactionKeys.list(urlParams),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.list({ urlParams }),
					),
					signal,
				),
		});
	},

	count: (params: TransactionCountParams = {}) =>
		queryOptions({
			queryKey: transactionKeys.count(params),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.count({ urlParams: params }),
					),
					signal,
				),
		}),

	getById: (id: TransactionId) =>
		queryOptions({
			queryKey: transactionKeys.detail(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.getById({ path: { id } }),
					),
					signal,
				),
		}),

	/**
	 * The internal-transfer counterpart suggestions for one row (PRD #48),
	 * computed server-side over the whole dataset. Returns the candidate legs
	 * (opposite sign, equal magnitude to the cent, a different account, within
	 * `TRANSFER_DATE_WINDOW_DAYS`), nearest-date first — an empty array for an
	 * ineligible row (already grouped, a refund). Linking a suggestion mutates
	 * every affected row's group, so invalidate `transactionKeys.all` after.
	 */
	transferSuggestions: (id: TransactionId) =>
		queryOptions({
			queryKey: transactionKeys.transferSuggestions(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.transferSuggestions({ path: { id } }),
					),
					signal,
				),
		}),

	/**
	 * Every detected internal-transfer pair across the whole dataset (PRD #48) —
	 * the Transfers page's data source. Each pair comes back once, oriented
	 * `from` = debit / `to` = credit, closest-date first, with a `daysApart`.
	 * Linking a pair regroups its legs, so invalidate `transactionKeys.all` after.
	 */
	transferCandidates: () =>
		queryOptions({
			queryKey: transactionKeys.transferCandidates(),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.transferCandidates(),
					),
					signal,
				),
		}),

	/**
	 * The **recap** (issue #71): spend for a period and an account selection,
	 * aggregated by issuer and by category **server-side, over the whole filtered
	 * set** — no page, no row cap, no partial answer to caveat in the UI. The
	 * buckets carry ids (`null` for the unassigned one) and are summed in integer
	 * cents; the caller resolves the names it shows from the ids it is showing.
	 * Any write that changes an amount, an issuer, a category or an exclusion
	 * moves these totals, so invalidate `transactionKeys.all` after one.
	 */
	recap: (params: RecapParams = {}) =>
		queryOptions({
			queryKey: transactionKeys.recap(params),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.recap({ urlParams: params }),
					),
					signal,
				),
		}),

	/**
	 * Every `"YYYY-MM"` the data covers, newest first — the recap period picker's
	 * options, derived from the transaction `date` exactly as the period bounds
	 * are. Unscoped by period on purpose: switching away from a month must never
	 * drop the option of switching back to it.
	 */
	recapPeriods: () =>
		queryOptions({
			queryKey: transactionKeys.recapPeriods(),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.recapPeriods(),
					),
					signal,
				),
		}),

	/**
	 * How many **bundles** committing an import for one account + month would
	 * dissolve (issue #77) — the import wizard's pre-flight, read before the user
	 * commits so the bundling is never destroyed silently.
	 *
	 * Server-side by necessity, not by preference: a bundle spanning two months or
	 * two accounts is only *partly* inside the statement being replaced, so the
	 * count cannot be inferred from whatever page the client happens to hold. The
	 * commit dissolves through the same query this counts through. Any write that
	 * creates, dissolves or re-scopes a bundle moves this number, so invalidate
	 * `transactionKeys.all` after one.
	 */
	bundleImpact: (params: BundleImpactParams) =>
		queryOptions({
			queryKey: transactionKeys.bundleImpact(params),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.bundleImpact({ urlParams: params }),
					),
					signal,
				),
		}),

	/**
	 * Fetch many by id in one round-trip. A read, but the id list rides in the
	 * POST body (contract §2.5). Only existing ids come back — the result may be
	 * shorter than `ids` (partial existence).
	 */
	bulkGet: (ids: ReadonlyArray<TransactionId>) =>
		queryOptions({
			queryKey: transactionKeys.bulkGet(ids),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.transactions.bulkGet({ payload: { ids } }),
					),
					signal,
				),
		}),
};

/**
 * Mutation functions for the transactions resource. Returned as plain
 * `mutationFn`s (not wired to a specific `QueryClient`) so the caller owns
 * invalidation. Invalidate `transactionKeys.all` after a write.
 */
export const transactionMutations = {
	create: (payload: TransactionCreate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.create({ payload }),
			),
		),

	/** Create many at once → the created rows with generated ids (201). */
	bulkCreate: (records: TransactionBulkCreate["records"]) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.bulkCreate({ payload: { records } }),
			),
		),

	update: (id: TransactionId, payload: TransactionUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.update({ path: { id }, payload }),
			),
		),

	/** Upsert many full rows by id → `{ count }` written (the client holds the rows). */
	bulkPut: (records: TransactionBulkPut["records"]) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.bulkPut({ payload: { records } }),
			),
		),

	remove: (id: TransactionId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.remove({ path: { id } }),
			),
		),

	/**
	 * Clear a row's manual issuer, then re-derive it against the current rule set
	 * (PRD #8 story 10) — it becomes unmatched, or is claimed by an existing rule,
	 * and is rule-eligible again. Powers the per-row "remove manual issuer" action
	 * on the Matching Rule preview's manual-collision list. Returns the updated row.
	 */
	removeManualIssuer: (id: TransactionId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.removeManualIssuer({ path: { id } }),
			),
		),

	/** Delete many by id → `{ count }` actually deleted (unknown ids ignored). */
	bulkDelete: (ids: ReadonlyArray<TransactionId>) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.bulkDelete({ payload: { ids } }),
			),
		),

	/** Targeted delete of one account's import month → `{ count }` deleted. */
	deleteByAccountMonth: (accountId: AccountId, importMonth: string) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.deleteByAccountMonth({
					urlParams: { accountId, importMonth },
				}),
			),
		),

	/** Targeted delete of one import batch → `{ count }` deleted. */
	deleteByImportBatch: (batchId: string) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.deleteByImportBatch({ path: { batchId } }),
			),
		),

	/**
	 * Group a set of transactions as one internal transfer (PRD #48) → `{ count }`
	 * legs stamped. The server validates the set atomically (≥2 legs, real ids,
	 * none already grouped, none a refund, amounts summing to zero in cents) and
	 * fails `TransferInvalid` (422) otherwise; it computes `min(ids)` as the group
	 * id. Invalidate `transactionKeys.all` after — every leg's row changed.
	 */
	linkTransfer: (ids: ReadonlyArray<TransactionId>) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.linkTransfer({ payload: { ids } }),
			),
		),

	/**
	 * Dissolve a transfer group (PRD #48) → `{ count }` legs cleared. The legs
	 * revert to normal transactions. Invalidate `transactionKeys.all` after.
	 */
	unlinkTransfer: (transferGroupId: TransactionId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.unlinkTransfer({ payload: { transferGroupId } }),
			),
		),

	/**
	 * Treat a set of transactions as **one** (issue #68) → the created **bundle
	 * parent** (201). The server validates the set atomically (≥2 distinct
	 * members, real ids, none already bundled) and fails `BundleInvalid` (422)
	 * otherwise; the parent's amount is the members' sum and its date the earliest
	 * of theirs. Invalidate `transactionKeys.all` after: every member has left the
	 * top level of the list, and a new row has joined it.
	 */
	createBundle: (ids: ReadonlyArray<TransactionId>, label: string) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.createBundle({ payload: { ids, label } }),
			),
		),

	/**
	 * Add one existing transaction to one existing **bundle** (issue #74) → the
	 * **recomputed parent**, whose amount and default date have just moved. Fails
	 * `BundleInvalid` (422) when either id is unknown, the target is not a parent,
	 * the row is already bundled, or the row is itself a parent. Invalidate
	 * `transactionKeys.all` after: the row has left the top level of the list and
	 * the parent's number has changed.
	 */
	addBundleMember: (bundleId: TransactionId, transactionId: TransactionId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.addBundleMember({
					payload: { bundleId, transactionId },
				}),
			),
		),

	/**
	 * Take a **bundle member** out of its bundle (issue #74) → the released row,
	 * an ordinary transaction again, with the issuer, category and notes bundling
	 * never touched. The bundle is implied — a row belongs to at most one. Its
	 * parent is recomputed, and **dissolved** if fewer than two members remain, so
	 * this call may remove a row from the list as well as return one to it.
	 */
	removeBundleMember: (transactionId: TransactionId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.removeBundleMember({ payload: { transactionId } }),
			),
		),

	/**
	 * Dissolve a **bundle** (issue #74) → `{ count }` members released. The parent
	 * row is deleted; the members are bank rows and come back to the list exactly
	 * as they were. Idempotent, like `unlinkTransfer`.
	 */
	dissolveBundle: (bundleId: TransactionId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.dissolveBundle({ payload: { bundleId } }),
			),
		),
};
