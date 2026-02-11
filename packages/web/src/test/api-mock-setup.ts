// Global mock setup — wires all @mamen/api modules to the in-memory test db.
// This file is loaded via vitest setupFiles so every test gets these mocks automatically.

import type { AppSettings, Setting, SettingKey } from "@mamen/shared";
import { QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
import { db } from "@/lib/db";

// ─── queryKeys (duplicated here to avoid circular mock deps) ────
const queryKeys = {
	accounts: {
		all: ["accounts"] as const,
		detail: (id: number) => ["accounts", id] as const,
	},
	transactions: {
		all: ["transactions"] as const,
		list: (params: object) => ["transactions", "list", params] as const,
		detail: (id: number) => ["transactions", id] as const,
		count: (params?: object) => ["transactions", "count", params] as const,
	},
	merchants: {
		all: ["merchants"] as const,
		list: (params?: object) => ["merchants", "list", params] as const,
		detail: (id: number) => ["merchants", id] as const,
	},
	rules: {
		all: ["rules"] as const,
		list: (params?: object) => ["rules", "list", params] as const,
		detail: (id: number) => ["rules", id] as const,
		count: (params?: object) => ["rules", "count", params] as const,
	},
	categories: {
		all: ["categories"] as const,
		list: (params?: object) => ["categories", "list", params] as const,
		detail: (id: number) => ["categories", id] as const,
	},
	subscriptions: {
		all: ["subscriptions"] as const,
		list: (params?: object) => ["subscriptions", "list", params] as const,
		detail: (id: number) => ["subscriptions", id] as const,
	},
	settings: {
		all: ["settings"] as const,
	},
	appSettings: {
		all: ["appSettings"] as const,
	},
};

// ─── Test QueryClient ───────────────────────────────────────────
// Shared test QueryClient — tests can import this via the barrel mock.
const testQueryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: false, gcTime: 0, staleTime: 0 },
		mutations: { retry: false },
	},
});

// Helper: invalidate TanStack Query cache when test mocks mutate data
const invalidate = (...entities: string[]) => {
	for (const entity of entities) {
		const keys = queryKeys[entity as keyof typeof queryKeys];
		if (keys?.all) {
			testQueryClient.invalidateQueries({ queryKey: keys.all });
		}
	}
	// Also invalidate composed queries
	for (const prefix of [
		"merchantDetail",
		"merchantsList",
		"merchantSearchSelect",
		"existingMerchant",
		"rulesListByMerchant",
		"dataManagementCounts",
		"categoryTooltip",
	]) {
		testQueryClient.invalidateQueries({ queryKey: [prefix] });
	}
};

// ─── Mock API modules ───────────────────────────────────────────
// All entity API objects used by the mock barrel below

const mockAccountsApi = {
	getAll: () => db.accounts.toArray(),
	get: (id: number) => db.accounts.get(id),
	getByName: (name: string) => db.accounts.where("name").equals(name).first(),
	getByType: (type: string) =>
		db.accounts.where("type").equals(type).toArray(),
	create: async (data: Record<string, unknown>) => {
		const id = await db.accounts.add(data as never);
		invalidate("accounts");
		return id;
	},
	update: async (id: number, changes: Record<string, unknown>) => {
		await db.accounts.update(id, changes as never);
		invalidate("accounts");
	},
	delete: async (id: number) => {
		await db.accounts.delete(id);
		invalidate("accounts");
	},
};

const mockTransactionsApi = {
	getAll: (params: Record<string, unknown> = {}) =>
		db.transactions.toArray().then((all) => {
			let result = all;
			if (params.accountId !== undefined)
				result = result.filter((t) => t.accountId === params.accountId);
			if (params.importMonth !== undefined)
				result = result.filter((t) => t.importMonth === params.importMonth);
			if (params.merchantId !== undefined)
				result = result.filter((t) => t.merchantId === params.merchantId);
			if (params.categoryId !== undefined)
				result = result.filter((t) => t.categoryId === params.categoryId);
			if (params.importBatchId !== undefined)
				result = result.filter(
					(t) => t.importBatchId === params.importBatchId,
				);
			if (params.linkedRefundId !== undefined)
				result = result.filter(
					(t) => t.linkedRefundId === params.linkedRefundId,
				);
			if (params.startDate)
				result = result.filter(
					(t) => t.date >= new Date(params.startDate as string),
				);
			if (params.endDate)
				result = result.filter(
					(t) => t.date <= new Date(params.endDate as string),
				);
			if (params.orderBy === "date") {
				const dir = params.direction === "asc" ? 1 : -1;
				result.sort(
					(a, b) =>
						dir * (new Date(a.date).getTime() - new Date(b.date).getTime()),
				);
			}
			return result;
		}),
	get: (id: number) => db.transactions.get(id),
	count: (params: Record<string, unknown> = {}) =>
		db.transactions.toArray().then((all) => {
			let result = all;
			if (params.accountId !== undefined)
				result = result.filter((t) => t.accountId === params.accountId);
			if (params.importMonth !== undefined)
				result = result.filter((t) => t.importMonth === params.importMonth);
			if (params.importBatchId !== undefined)
				result = result.filter(
					(t) => t.importBatchId === params.importBatchId,
				);
			return result.length;
		}),
	create: async (data: Record<string, unknown>) => {
		const id = await db.transactions.add(data as never);
		invalidate("transactions");
		return id;
	},
	bulkAdd: async (records: Record<string, unknown>[]) => {
		const result = await db.transactions.bulkAdd(records as never);
		invalidate("transactions");
		return result;
	},
	bulkGet: (ids: number[]) => db.transactions.bulkGet(ids),
	bulkPut: async (records: Record<string, unknown>[]) => {
		const result = await db.transactions.bulkPut(records as never);
		invalidate("transactions");
		return result;
	},
	update: async (id: number, changes: Record<string, unknown>) => {
		await db.transactions.update(id, changes as never);
		invalidate("transactions");
	},
	delete: async (id: number) => {
		await db.transactions.delete(id);
		invalidate("transactions");
	},
	bulkDelete: async (ids: number[]) => {
		await db.transactions.bulkDelete(ids);
		invalidate("transactions");
	},
	deleteByAccountMonth: async (accountId: number, importMonth: string) => {
		const all = await db.transactions.toArray();
		for (const t of all) {
			if (
				t.accountId === accountId &&
				t.importMonth === importMonth &&
				t.id !== undefined
			) {
				await db.transactions.delete(t.id);
			}
		}
		invalidate("transactions");
	},
	deleteByImportBatch: async (batchId: string) => {
		const all = await db.transactions.toArray();
		for (const t of all) {
			if (t.importBatchId === batchId && t.id !== undefined) {
				await db.transactions.delete(t.id);
			}
		}
		invalidate("transactions");
	},
};

const mockMerchantsApi = {
	getAll: (params: Record<string, unknown> = {}) =>
		db.merchants.toArray().then((all) => {
			if (params.orderBy === "name") {
				all.sort((a, b) => a.name.localeCompare(b.name));
			}
			return all;
		}),
	get: (id: number) => db.merchants.get(id),
	getByName: (name: string) =>
		db.merchants.where("name").equals(name).first(),
	getByNameCaseInsensitive: (name: string) =>
		db.merchants.toArray().then((all) => {
			const r = all.find((m) => m.name.toLowerCase() === name.toLowerCase());
			return r ?? undefined;
		}),
	create: async (data: Record<string, unknown>) => {
		const id = await db.merchants.add(data as never);
		invalidate("merchants");
		return id;
	},
	update: async (id: number, changes: Record<string, unknown>) => {
		await db.merchants.update(id, changes as never);
		invalidate("merchants");
	},
	bulkPut: async (records: Record<string, unknown>[]) => {
		const result = await db.merchants.bulkPut(records as never);
		invalidate("merchants");
		return result;
	},
	delete: async (id: number) => {
		await db.merchants.delete(id);
		invalidate("merchants");
	},
};

const mockRulesApi = {
	getAll: (params: Record<string, unknown> = {}) =>
		db.rules.toArray().then((all) => {
			if (params.merchantId !== undefined)
				return all.filter((r) => r.merchantId === params.merchantId);
			return all;
		}),
	get: (id: number) => db.rules.get(id),
	count: (params: Record<string, unknown> = {}) =>
		db.rules.toArray().then((all) => {
			if (params.merchantId !== undefined)
				return all.filter((r) => r.merchantId === params.merchantId).length;
			return all.length;
		}),
	getByMerchantIdAndPattern: (merchantId: number, pattern: string) =>
		db.rules.toArray().then((all) => {
			const r = all.find(
				(rule) => rule.merchantId === merchantId && rule.pattern === pattern,
			);
			return r ?? undefined;
		}),
	create: async (data: Record<string, unknown>) => {
		const id = await db.rules.add(data as never);
		invalidate("rules");
		return id;
	},
	bulkAdd: async (records: Record<string, unknown>[]) => {
		const result = await db.rules.bulkAdd(records as never);
		invalidate("rules");
		return result;
	},
	update: async (id: number, changes: Record<string, unknown>) => {
		await db.rules.update(id, changes as never);
		invalidate("rules");
	},
	delete: async (id: number) => {
		await db.rules.delete(id);
		invalidate("rules");
	},
	bulkDelete: async (ids: number[]) => {
		await db.rules.bulkDelete(ids);
		invalidate("rules");
	},
};

const mockSettingsApi = {
	getAll: () => db.settings.toArray(),
	getByKey: (key: SettingKey) =>
		db.settings.toArray().then((all) => {
			const r = (all as Setting[]).find((s) => s.key === key);
			if (!r) throw Object.assign(new Error("Not found"), { status: 404 });
			return r;
		}),
	putByKey: async (setting: Setting) => {
		const all = await db.settings.toArray();
		const existing = (all as Setting[]).find((s) => s.key === setting.key);
		if (existing && existing.id !== undefined) {
			await db.settings.update(existing.id, setting as never);
		} else {
			await db.settings.add(setting as never);
		}
		invalidate("settings");
	},
	delete: async (id: number) => {
		await db.settings.delete(id);
		invalidate("settings");
	},
	clear: async () => {
		await db.settings.clear();
		invalidate("settings");
	},
};

const mockAppSettingsApi = {
	get: async () => {
		const all = await db.appSettings.toArray();
		return all[0] ?? null;
	},
	put: async (settings: AppSettings) => {
		await db.appSettings.clear();
		await db.appSettings.add(settings as never);
		invalidate("appSettings");
	},
	clear: async () => {
		await db.appSettings.clear();
		invalidate("appSettings");
	},
};

const mockCategoriesApi = {
	getAll: (params: Record<string, unknown> = {}) =>
		db.categories.toArray().then((all) => {
			let result = all;
			if (params.parentId !== undefined)
				result = result.filter((c) => c.parentId === params.parentId);
			if (params.orderBy === "sortOrder")
				result.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
			return result;
		}),
	getRoot: () =>
		db.categories
			.toArray()
			.then((all) => all.filter((c) => c.parentId === null)),
	get: (id: number) => db.categories.get(id),
	getBySlug: (slug: string) =>
		db.categories.toArray().then((all) => {
			const r = all.find((c) => c.slug === slug);
			return r ?? undefined;
		}),
	create: async (data: Record<string, unknown>) => {
		const id = await db.categories.add(data as never);
		invalidate("categories");
		return id;
	},
	bulkAdd: async (records: Record<string, unknown>[]) => {
		const result = await db.categories.bulkAdd(records as never);
		invalidate("categories");
		return result;
	},
	update: async (id: number, changes: Record<string, unknown>) => {
		await db.categories.update(id, changes as never);
		invalidate("categories");
	},
	bulkPut: async (records: Record<string, unknown>[]) => {
		const result = await db.categories.bulkPut(records as never);
		invalidate("categories");
		return result;
	},
	delete: async (id: number) => {
		await db.categories.delete(id);
		invalidate("categories");
	},
	clear: async () => {
		await db.categories.clear();
		invalidate("categories");
	},
};

const mockSubscriptionsApi = {
	getAll: (params: Record<string, unknown> = {}) =>
		db.subscriptions.toArray().then((all) => {
			let result = all;
			if (params.merchantId !== undefined)
				result = result.filter((s) => s.merchantId === params.merchantId);
			if (params.status !== undefined)
				result = result.filter((s) => s.status === params.status);
			return result;
		}),
	get: (id: number) => db.subscriptions.get(id),
	getFirstByMerchant: (merchantId: number) =>
		db.subscriptions.toArray().then((all) => {
			const r = all.find((s) => s.merchantId === merchantId);
			return r ?? undefined;
		}),
	getByMerchantAndFrequency: (merchantId: number, frequency: string) =>
		db.subscriptions.toArray().then((all) => {
			const r = all.find(
				(s) => s.merchantId === merchantId && s.frequency === frequency,
			);
			return r ?? undefined;
		}),
	create: async (data: Record<string, unknown>) => {
		const id = await db.subscriptions.add(data as never);
		invalidate("subscriptions");
		return id;
	},
	update: async (id: number, changes: Record<string, unknown>) => {
		await db.subscriptions.update(id, changes as never);
		invalidate("subscriptions");
	},
	bulkPut: async (records: Record<string, unknown>[]) => {
		const result = await db.subscriptions.bulkPut(records as never);
		invalidate("subscriptions");
		return result;
	},
	delete: async (id: number) => {
		await db.subscriptions.delete(id);
		invalidate("subscriptions");
	},
	clear: async () => {
		await db.subscriptions.clear();
		invalidate("subscriptions");
	},
};

const mockImportApi = {
	run: vi.fn().mockResolvedValue({ ok: true }),
};

const mockDatabaseApi = {
	reset: async () => {
		await db.accounts.clear();
		await db.transactions.clear();
		await db.merchants.clear();
		await db.rules.clear();
		await db.categories.clear();
		await db.subscriptions.clear();
		await db.settings.clear();
		await db.appSettings.clear();
		invalidate(
			"accounts",
			"transactions",
			"merchants",
			"rules",
			"categories",
			"subscriptions",
			"settings",
			"appSettings",
		);
	},
	export: async () => ({
		accounts: await db.accounts.toArray(),
		transactions: await db.transactions.toArray(),
		merchants: await db.merchants.toArray(),
		rules: await db.rules.toArray(),
		categories: await db.categories.toArray(),
		subscriptions: await db.subscriptions.toArray(),
		settings: await db.settings.toArray(),
		appSettings: (await db.appSettings.toArray())[0] ?? null,
	}),
	import: async (data: Record<string, unknown[]>) => {
		await db.accounts.clear();
		await db.transactions.clear();
		await db.merchants.clear();
		await db.rules.clear();
		await db.categories.clear();
		await db.subscriptions.clear();
		await db.settings.clear();
		await db.appSettings.clear();
		if (data.accounts) await db.accounts.bulkAdd(data.accounts as never);
		if (data.transactions)
			await db.transactions.bulkAdd(data.transactions as never);
		if (data.merchants) await db.merchants.bulkAdd(data.merchants as never);
		if (data.rules) await db.rules.bulkAdd(data.rules as never);
		if (data.categories)
			await db.categories.bulkAdd(data.categories as never);
		if (data.subscriptions)
			await db.subscriptions.bulkAdd(data.subscriptions as never);
		if (data.settings) await db.settings.bulkAdd(data.settings as never);
		if (data.appSettings) await db.appSettings.add(data.appSettings as never);
		invalidate(
			"accounts",
			"transactions",
			"merchants",
			"rules",
			"categories",
			"subscriptions",
			"settings",
			"appSettings",
		);
	},
};

const mockInvalidateEntity = (...entities: string[]) => invalidate(...entities);
const mockInvalidateAll = () => testQueryClient.invalidateQueries();

// ─── Mock @mamen/api (the source package) ───────────────────────
vi.mock("@mamen/api", () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
	ApiError: class ApiError extends Error {
		status: number;
		constructor(message: string, status: number) {
			super(message);
			this.status = status;
		}
	},
	queryKeys,
	queryClient: testQueryClient,
	invalidateEntity: mockInvalidateEntity,
	invalidateAll: mockInvalidateAll,
	accountsApi: mockAccountsApi,
	transactionsApi: mockTransactionsApi,
	merchantsApi: mockMerchantsApi,
	rulesApi: mockRulesApi,
	settingsApi: mockSettingsApi,
	appSettingsApi: mockAppSettingsApi,
	categoriesApi: mockCategoriesApi,
	subscriptionsApi: mockSubscriptionsApi,
	importApi: mockImportApi,
	databaseApi: mockDatabaseApi,
	// Query helper stubs (not used in tests yet)
	defineQueries: vi.fn(),
	defineMutations: vi.fn(),
	accountQueries: {},
	accountMutations: {},
	appSettingQueries: {},
	appSettingMutations: {},
	categoryQueries: {},
	categoryMutations: {},
	databaseMutations: {},
	importMutations: {},
	merchantQueries: {},
	merchantMutations: {},
	ruleQueries: {},
	ruleMutations: {},
	settingQueries: {},
	settingMutations: {},
	subscriptionQueries: {},
	subscriptionMutations: {},
	transactionQueries: {},
	transactionMutations: {},
}));

// ─── Mock @/lib/api (the web barrel re-export) ─────────────────
// Since @/lib/api re-exports from @mamen/api, we mock it the same way.
vi.mock("@/lib/api", async () => {
	const mamenApi = await import("@mamen/api");
	return { ...mamenApi };
});
