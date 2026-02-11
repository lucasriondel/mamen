import type { Account, AccountType } from "@mamen/shared";
import { api } from "./client";

export const accountsApi = {
	getAll: () => api.get<Account[]>("/accounts"),

	get: (id: number) => api.get<Account>(`/accounts/${id}`),

	getByName: (name: string) =>
		api.get<Account>(`/accounts/by-name/${encodeURIComponent(name)}`),

	getByType: (type: AccountType) =>
		api.get<Account[]>(`/accounts/by-type/${encodeURIComponent(type)}`),

	create: async (data: Omit<Account, "id">) => {
		const result = await api.post<{ id: number }>("/accounts", data);
		return result.id;
	},

	update: async (id: number, changes: Partial<Account>) => {
		await api.put(`/accounts/${id}`, changes);
	},

	delete: async (id: number) => {
		await api.delete(`/accounts/${id}`);
	},
};
