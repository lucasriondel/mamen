import type {
	AccountId,
	CategoryId,
	MerchantId,
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
	merchantId?: MerchantId;
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

	update: (id: TransactionId, payload: TransactionUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.update({ path: { id }, payload }),
			),
		),

	remove: (id: TransactionId) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.transactions.remove({ path: { id } }),
			),
		),
};
