import { api } from "./client";

type ExportData = {
	accounts: unknown[];
	transactions: unknown[];
	merchants: unknown[];
	rules: unknown[];
	categories: unknown[];
	subscriptions: unknown[];
	settings: unknown[];
	appSettings: unknown;
};

export const databaseApi = {
	reset: async () => {
		await api.post("/database/reset");
	},

	export: () => api.post<ExportData>("/database/export"),

	import: async (data: Partial<ExportData>) => {
		await api.post("/database/import", data);
	},
};
