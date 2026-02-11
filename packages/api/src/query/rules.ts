import type { Rule } from "@mamen/shared";
import { rulesApi } from "../rules";
import { queryKeys } from "../queryKeys";
import { defineQueries, defineMutations } from "./factory";

export const ruleQueries = defineQueries({
	list: {
		queryKey: (params?: { merchantId?: number }) =>
			queryKeys.rules.list(params),
		queryFn: (params?: { merchantId?: number }) => rulesApi.getAll(params),
	},
	detail: {
		queryKey: (id: number) => queryKeys.rules.detail(id),
		queryFn: (id: number) => rulesApi.get(id),
	},
	count: {
		queryKey: (params?: { merchantId?: number }) =>
			queryKeys.rules.count(params),
		queryFn: (params?: { merchantId?: number }) => rulesApi.count(params),
	},
	byMerchantIdAndPattern: {
		queryKey: (merchantId: number, pattern: string) =>
			["rules", "by-merchant-pattern", merchantId, pattern] as const,
		queryFn: (merchantId: number, pattern: string) =>
			rulesApi.getByMerchantIdAndPattern(merchantId, pattern),
	},
});

export const ruleMutations = defineMutations({
	create: {
		mutationFn: (data: Omit<Rule, "id">) => rulesApi.create(data),
		invalidates: ["rules"],
	},
	bulkAdd: {
		mutationFn: (records: Omit<Rule, "id">[]) => rulesApi.bulkAdd(records),
		invalidates: ["rules"],
	},
	update: {
		mutationFn: (vars: { id: number; changes: Partial<Rule> }) =>
			rulesApi.update(vars.id, vars.changes),
		invalidates: ["rules"],
	},
	remove: {
		mutationFn: (id: number) => rulesApi.delete(id),
		invalidates: ["rules"],
	},
	bulkDelete: {
		mutationFn: (ids: number[]) => rulesApi.bulkDelete(ids),
		invalidates: ["rules"],
	},
});
