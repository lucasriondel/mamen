import type { Account, AccountType } from "@mamen/shared";
import { accountsApi } from "../accounts";
import { queryKeys } from "../queryKeys";
import { defineQueries, defineMutations } from "./factory";

export const accountQueries = defineQueries({
	list: {
		queryKey: () => queryKeys.accounts.all,
		queryFn: () => accountsApi.getAll(),
	},
	detail: {
		queryKey: (id: number) => queryKeys.accounts.detail(id),
		queryFn: (id: number) => accountsApi.get(id),
	},
	byName: {
		queryKey: (name: string) => ["accounts", "by-name", name] as const,
		queryFn: (name: string) => accountsApi.getByName(name),
	},
	byType: {
		queryKey: (type: AccountType) => ["accounts", "by-type", type] as const,
		queryFn: (type: AccountType) => accountsApi.getByType(type),
	},
});

export const accountMutations = defineMutations({
	create: {
		mutationFn: (data: Omit<Account, "id">) => accountsApi.create(data),
		invalidates: ["accounts"],
	},
	update: {
		mutationFn: (vars: { id: number; changes: Partial<Account> }) =>
			accountsApi.update(vars.id, vars.changes),
		invalidates: ["accounts"],
	},
	remove: {
		mutationFn: (id: number) => accountsApi.delete(id),
		invalidates: ["accounts"],
	},
});
