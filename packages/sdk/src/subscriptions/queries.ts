import type {
	MerchantId,
	SubscriptionCreate,
	SubscriptionFrequency,
	SubscriptionId,
	SubscriptionStatus,
	SubscriptionUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * The `list` filter — `merchantId?` + `status?`, both optional and composable
 * (AND-combined), mirroring the contract.
 */
export type SubscriptionListParams = {
	limit?: number;
	offset?: number;
	merchantId?: MerchantId;
	status?: SubscriptionStatus;
};

/** Query-key factory for the subscriptions resource. */
export const subscriptionKeys = {
	all: ["subscriptions"] as const,
	lists: () => [...subscriptionKeys.all, "list"] as const,
	list: (params: SubscriptionListParams) =>
		[...subscriptionKeys.lists(), params] as const,
	firstByMerchant: (merchantId: MerchantId) =>
		[...subscriptionKeys.all, "first-by-merchant", merchantId] as const,
	byMerchantFrequency: (
		merchantId: MerchantId,
		frequency: SubscriptionFrequency,
	) =>
		[
			...subscriptionKeys.all,
			"by-merchant-frequency",
			merchantId,
			frequency,
		] as const,
};

/** tanstack-query read options for the subscriptions resource. */
export const subscriptionQueries = {
	list: (params: SubscriptionListParams = {}) => {
		const urlParams = { ...PaginationDefaults, ...params };
		return queryOptions({
			queryKey: subscriptionKeys.list(urlParams),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.subscriptions.list({ urlParams }),
					),
					signal,
				),
		});
	},

	getFirstByMerchant: (merchantId: MerchantId) =>
		queryOptions({
			queryKey: subscriptionKeys.firstByMerchant(merchantId),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.subscriptions.getFirstByMerchant({ path: { merchantId } }),
					),
					signal,
				),
		}),

	getByMerchantFrequency: (
		merchantId: MerchantId,
		frequency: SubscriptionFrequency,
	) =>
		queryOptions({
			queryKey: subscriptionKeys.byMerchantFrequency(merchantId, frequency),
			queryFn: ({ signal }) =>
				runQuery(
					Effect.flatMap(Client, (client) =>
						client.subscriptions.getByMerchantFrequency({
							path: { merchantId, frequency },
						}),
					),
					signal,
				),
		}),
};

/**
 * Mutation functions for the subscriptions resource. Returned as plain
 * `mutationFn`s (not wired to a specific `QueryClient`) so the caller owns
 * invalidation — the SDK stays invalidation-agnostic. Invalidate
 * `subscriptionKeys.all` after a write.
 */
export const subscriptionMutations = {
	create: (payload: SubscriptionCreate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.subscriptions.create({ payload }),
			),
		),

	update: (id: SubscriptionId, payload: SubscriptionUpdate) =>
		runQuery(
			Effect.flatMap(Client, (client) =>
				client.subscriptions.update({ path: { id }, payload }),
			),
		),
};
