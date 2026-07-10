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
	categoryId?: CategoryId;
	linkedRefundId?: TransactionId;
	importMonth?: string;
	importBatchId?: string;
	startDate?: Date;
	endDate?: Date;
	isRefund?: boolean;
	isDuplicateExcluded?: boolean;
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
};
