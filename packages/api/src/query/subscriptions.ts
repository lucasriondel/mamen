import type {
	Subscription,
	SubscriptionFrequency,
	SubscriptionStatus,
} from "@mamen/shared";
import { subscriptionsApi } from "../subscriptions";
import { queryKeys } from "../queryKeys";
import { defineQueries, defineMutations } from "./factory";

export const subscriptionQueries = defineQueries({
	list: {
		queryKey: (params?: {
			merchantId?: number;
			status?: SubscriptionStatus;
		}) => queryKeys.subscriptions.list(params),
		queryFn: (params?: { merchantId?: number; status?: SubscriptionStatus }) =>
			subscriptionsApi.getAll(params),
	},
	detail: {
		queryKey: (id: number) => queryKeys.subscriptions.detail(id),
		queryFn: (id: number) => subscriptionsApi.get(id),
	},
	firstByMerchant: {
		queryKey: (merchantId: number) =>
			["subscriptions", "first-by-merchant", merchantId] as const,
		queryFn: (merchantId: number) =>
			subscriptionsApi.getFirstByMerchant(merchantId),
	},
	byMerchantAndFrequency: {
		queryKey: (merchantId: number, frequency: SubscriptionFrequency) =>
			[
				"subscriptions",
				"by-merchant-frequency",
				merchantId,
				frequency,
			] as const,
		queryFn: (merchantId: number, frequency: SubscriptionFrequency) =>
			subscriptionsApi.getByMerchantAndFrequency(merchantId, frequency),
	},
});

export const subscriptionMutations = defineMutations({
	create: {
		mutationFn: (data: Omit<Subscription, "id">) =>
			subscriptionsApi.create(data),
		invalidates: ["subscriptions"],
	},
	update: {
		mutationFn: (vars: { id: number; changes: Partial<Subscription> }) =>
			subscriptionsApi.update(vars.id, vars.changes),
		invalidates: ["subscriptions"],
	},
	bulkPut: {
		mutationFn: (records: Subscription[]) =>
			subscriptionsApi.bulkPut(records),
		invalidates: ["subscriptions"],
	},
	remove: {
		mutationFn: (id: number) => subscriptionsApi.delete(id),
		invalidates: ["subscriptions"],
	},
	clear: {
		mutationFn: () => subscriptionsApi.clear(),
		invalidates: ["subscriptions"],
	},
});
