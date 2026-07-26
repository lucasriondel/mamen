import type {
	AccountId,
	CategoryId,
	IssuerId,
	TransactionBulkCreate,
	TransactionBulkPut,
	TransactionCreate,
	TransactionId,
	TransactionUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
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
	accountId?: AccountId;
	issuerId?: IssuerId;
	/**
	 * One category id, or a **set** of them (ADR 0002). A leaf page passes a lone
	 * id; a folder page passes all of its leaves' ids so their transactions come
	 * back in one query. The filter matches the *derived* category, so it includes
	 * issuer-categorised rows, not only hand-overridden ones.
	 */
	categoryId?: CategoryId | ReadonlyArray<CategoryId>;
	linkedRefundId?: TransactionId;
	/**
	 * Transfer-group membership (PRD #48) — narrows to the legs of one internal
	 * transfer, so a caller can query "the legs of group X". Mirrors
	 * `linkedRefundId`; the group id is one of the legs' `TransactionId`s.
	 */
	transferGroupId?: TransactionId;
	importMonth?: string;
	importBatchId?: string;
	startDate?: Date;
	endDate?: Date;
	isRefund?: boolean;
	isDuplicateExcluded?: boolean;
	/** Free-text substring matched across issuer text/name, notes, amount (#40). */
	search?: string;
	orderBy?: "date";
	direction?: "asc" | "desc";
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
	bulkGet: (ids: ReadonlyArray<TransactionId>) =>
		[...transactionKeys.all, "bulk-get", ids] as const,
};

/** tanstack-query read options for the transactions resource. */
export const transactionQueries = {
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
};
