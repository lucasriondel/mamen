import type { Transaction } from "@mamen/shared";
import { api } from "./client";

type TransactionQueryParams = {
	accountId?: number;
	importMonth?: string;
	merchantId?: number;
	categoryId?: number;
	importBatchId?: string;
	linkedRefundId?: number;
	startDate?: string;
	endDate?: string;
	orderBy?: "date";
	direction?: "asc" | "desc";
};

const buildQuery = (params: Record<string, string | number | undefined>) => {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) search.set(key, String(value));
	}
	const qs = search.toString();
	return qs ? `?${qs}` : "";
};

export const transactionsApi = {
	getAll: (params: TransactionQueryParams = {}) =>
		api.get<Transaction[]>(`/transactions${buildQuery(params)}`),

	get: (id: number) => api.get<Transaction>(`/transactions/${id}`),

	count: (
		params: {
			accountId?: number;
			importMonth?: string;
			importBatchId?: string;
		} = {},
	) =>
		api
			.get<{ count: number }>(`/transactions/count${buildQuery(params)}`)
			.then((r) => r.count),

	create: async (data: Omit<Transaction, "id">) => {
		const result = await api.post<{ id: number }>("/transactions", data);
		return result.id;
	},

	bulkAdd: async (records: Omit<Transaction, "id">[]) => {
		const result = await api.post<{ ids: number[] }>("/transactions/bulk", {
			records,
		});
		return result.ids;
	},

	bulkGet: (ids: number[]) =>
		api.post<Transaction[]>("/transactions/bulk-get", { ids }),

	bulkPut: async (records: Transaction[]) => {
		await api.put("/transactions/bulk-put", { records });
	},

	update: async (id: number, changes: Partial<Transaction>) => {
		await api.put(`/transactions/${id}`, changes);
	},

	delete: async (id: number) => {
		await api.delete(`/transactions/${id}`);
	},

	bulkDelete: async (ids: number[]) => {
		await api.post("/transactions/bulk-delete", { ids });
	},

	deleteByAccountMonth: async (accountId: number, importMonth: string) => {
		await api.delete(
			`/transactions/by-account-month?accountId=${accountId}&importMonth=${encodeURIComponent(importMonth)}`,
		);
	},

	deleteByImportBatch: async (batchId: string) => {
		await api.delete(
			`/transactions/by-import-batch/${encodeURIComponent(batchId)}`,
		);
	},
};
