import type { Transaction } from "@mamen/shared";
import { queryKeys } from "../queryKeys";
import { transactionsApi } from "../transactions";
import { defineMutations, defineQueries } from "./factory";

export const transactionQueries = defineQueries({
	list: {
		queryKey: (params: object = {}) => queryKeys.transactions.list(params),
		queryFn: (params: object = {}) => transactionsApi.getAll(params as any),
	},
	detail: {
		queryKey: (id: number) => queryKeys.transactions.detail(id),
		queryFn: (id: number) => transactionsApi.get(id),
	},
	count: {
		queryKey: (params?: object) => queryKeys.transactions.count(params),
		queryFn: (params?: object) => transactionsApi.count(params as any),
	},
});

export const transactionMutations = defineMutations({
	create: {
		mutationFn: (data: Omit<Transaction, "id">) => transactionsApi.create(data),
		invalidates: ["transactions"],
	},
	bulkAdd: {
		mutationFn: (records: Omit<Transaction, "id">[]) =>
			transactionsApi.bulkAdd(records),
		invalidates: ["transactions"],
	},
	bulkPut: {
		mutationFn: (records: Transaction[]) => transactionsApi.bulkPut(records),
		invalidates: ["transactions"],
	},
	update: {
		mutationFn: (vars: { id: number; changes: Partial<Transaction> }) =>
			transactionsApi.update(vars.id, vars.changes),
		invalidates: ["transactions"],
	},
	remove: {
		mutationFn: (id: number) => transactionsApi.delete(id),
		invalidates: ["transactions"],
	},
	bulkDelete: {
		mutationFn: (ids: number[]) => transactionsApi.bulkDelete(ids),
		invalidates: ["transactions"],
	},
	deleteByAccountMonth: {
		mutationFn: (vars: { accountId: number; importMonth: string }) =>
			transactionsApi.deleteByAccountMonth(vars.accountId, vars.importMonth),
		invalidates: ["transactions"],
	},
	deleteByImportBatch: {
		mutationFn: (batchId: string) =>
			transactionsApi.deleteByImportBatch(batchId),
		invalidates: ["transactions"],
	},
});
