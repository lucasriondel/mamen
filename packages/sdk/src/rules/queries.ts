import type {
	MerchantId,
	RuleCreate,
	RuleId,
	RuleUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** The `list` filter — `merchantId` optional, mirroring the contract. */
export type RuleListParams = {
	limit?: number;
	offset?: number;
	merchantId?: MerchantId;
};

/** The `count` filter — the same `merchantId?` scope, no pagination. */
export type RuleCountParams = {
	merchantId?: MerchantId;
};

/** Query-key factory for the rules resource. */
export const ruleKeys = {
	all: ["rules"] as const,
	lists: () => [...ruleKeys.all, "list"] as const,
	list: (params: RuleListParams) => [...ruleKeys.lists(), params] as const,
	counts: () => [...ruleKeys.all, "count"] as const,
	count: (params: RuleCountParams) => [...ruleKeys.counts(), params] as const,
	details: () => [...ruleKeys.all, "detail"] as const,
	detail: (id: RuleId) => [...ruleKeys.details(), id] as const,
	byMerchantPattern: (merchantId: MerchantId, pattern: string) =>
		[...ruleKeys.all, "by-merchant-pattern", merchantId, pattern] as const,
};

/** tanstack-query read options for the rules resource. */
export const ruleQueries = {
	list: (params: RuleListParams = {}) => {
		const urlParams = { ...PaginationDefaults, ...params };
		return queryOptions({
			queryKey: ruleKeys.list(urlParams),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) => client.rules.list({ urlParams })),
					signal,
				),
		});
	},

	count: (params: RuleCountParams = {}) =>
		queryOptions({
			queryKey: ruleKeys.count(params),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.rules.count({ urlParams: params }),
					),
					signal,
				),
		}),

	getById: (id: RuleId) =>
		queryOptions({
			queryKey: ruleKeys.detail(id),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.rules.getById({ path: { id } }),
					),
					signal,
				),
		}),

	getByMerchantPattern: (merchantId: MerchantId, pattern: string) =>
		queryOptions({
			queryKey: ruleKeys.byMerchantPattern(merchantId, pattern),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.rules.getByMerchantPattern({
							path: { merchantId, pattern },
						}),
					),
					signal,
				),
		}),
};

/**
 * Mutation functions for the rules resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`) so the caller owns invalidation — the
 * SDK stays invalidation-agnostic. Invalidate `ruleKeys.all` after a write.
 */
export const ruleMutations = {
	create: (payload: RuleCreate) =>
		runQuery(
			Effect.flatMap(Client, (client) => client.rules.create({ payload })),
		),

	update: (id: RuleId, payload: RuleUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.rules.update({ path: { id }, payload }),
			),
		),

	remove: (id: RuleId) =>
		runQuery(
			Effect.flatMap(Client, (client) => client.rules.remove({ path: { id } })),
		),
};
