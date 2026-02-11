import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { APP_VERSION } from "@/lib/constants";
import { db } from "@/lib/db";
import type { ExportData } from "../types/export.types";
import { exportAllData } from "./exportService";

const blobToText = (blob: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsText(blob);
	});

const blobToJson = async (blob: Blob): Promise<ExportData> =>
	JSON.parse(await blobToText(blob));

const clearDb = async () => {
	await db.accounts.clear();
	await db.transactions.clear();
	await db.merchants.clear();
	await db.rules.clear();
	await db.settings.clear();
	await db.appSettings.clear();
	await db.categories.clear();
	await db.subscriptions.clear();
};

describe("exportAllData", () => {
	beforeEach(async () => {
		await clearDb();
	});

	it("exports all tables when no options provided", async () => {
		await db.accounts.add({
			name: "Checking",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.merchants.add({
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		});

		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.accounts).toHaveLength(1);
		expect(data.merchants).toHaveLength(1);
		expect(data.transactions).toHaveLength(0);
		expect(data.rules).toHaveLength(0);
		expect(data.categories).toHaveLength(0);
		expect(data.subscriptions).toHaveLength(0);
		expect(data.settings).toHaveLength(0);
		expect(data.appSettings).toHaveLength(0);
	});

	it("respects partial options (transactions only)", async () => {
		await db.accounts.add({
			name: "Checking",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: 42,
			rawMerchantString: "Test",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const blob = await exportAllData({
			includeAccounts: false,
			includeMerchants: false,
			includeRules: false,
			includeCategories: false,
			includeSubscriptions: false,
			includeSettings: false,
		});
		const data = await blobToJson(blob);

		expect(data.transactions).toHaveLength(1);
		expect(data.accounts).toHaveLength(0);
		expect(data.merchants).toHaveLength(0);
	});

	it("metadata has correct record counts", async () => {
		await db.accounts.add({
			name: "A1",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.accounts.add({
			name: "A2",
			type: "savings",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: 10,
			rawMerchantString: "M",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.metadata.recordCounts.accounts).toBe(2);
		expect(data.metadata.recordCounts.transactions).toBe(1);
		expect(data.metadata.recordCounts.merchants).toBe(0);
	});

	it("metadata has correct exportDate in ISO format", async () => {
		const before = new Date().toISOString();
		const blob = await exportAllData();
		const after = new Date().toISOString();
		const data = await blobToJson(blob);

		expect(data.metadata.exportDate >= before).toBe(true);
		expect(data.metadata.exportDate <= after).toBe(true);
	});

	it("metadata has correct exportFormat string", async () => {
		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.metadata.exportFormat).toBe("mamen-backup-v1");
	});

	it("metadata has correct appVersion", async () => {
		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.metadata.appVersion).toBe(APP_VERSION);
	});

	it("JSON is valid and parseable", async () => {
		const blob = await exportAllData();
		const text = await blobToText(blob);

		expect(() => JSON.parse(text)).not.toThrow();
	});

	it("JSON is pretty-printed with indentation", async () => {
		const blob = await exportAllData();
		const text = await blobToText(blob);

		expect(text).toContain("\n");
		expect(text).toContain("  ");
	});

	it("empty database exports valid JSON with zero counts", async () => {
		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.metadata.recordCounts.accounts).toBe(0);
		expect(data.metadata.recordCounts.transactions).toBe(0);
		expect(data.metadata.recordCounts.merchants).toBe(0);
		expect(data.metadata.recordCounts.rules).toBe(0);
		expect(data.metadata.recordCounts.categories).toBe(0);
		expect(data.metadata.recordCounts.subscriptions).toBe(0);
		expect(data.metadata.recordCounts.settings).toBe(0);
		expect(data.metadata.recordCounts.appSettings).toBe(0);
		expect(data.accounts).toEqual([]);
		expect(data.transactions).toEqual([]);
	});

	it("blob has correct content type", async () => {
		const blob = await exportAllData();

		expect(blob.type).toBe("application/json");
	});

	it("preserves transaction anomaly fields", async () => {
		await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: 999,
			rawMerchantString: "Big Purchase",
			importedAt: new Date(),
			importMonth: "2026-01",
			isRefund: true,
			linkedRefundId: 42,
			anomalyFlags: [
				{
					type: "high-amount",
					reason: "test",
					detectedAt: "2026-01-01",
					dismissed: false,
				},
			],
			isDuplicateExcluded: true,
			duplicateNote: "Duplicate",
		});

		const blob = await exportAllData();
		const data = await blobToJson(blob);
		const tx = data.transactions[0];

		expect(tx.isRefund).toBe(true);
		expect(tx.linkedRefundId).toBe(42);
		expect(tx.anomalyFlags).toHaveLength(1);
		expect(tx.anomalyFlags?.[0].type).toBe("high-amount");
		expect(tx.isDuplicateExcluded).toBe(true);
		expect(tx.duplicateNote).toBe("Duplicate");
	});

	it("full integration: seeds all tables and verifies complete export", async () => {
		const accountId = await db.accounts.add({
			name: "Main",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const merchantId = await db.merchants.add({
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		});
		await db.rules.add({
			merchantId,
			pattern: "AMZN.*",
			matchCount: 5,
			createdAt: new Date(),
		});
		await db.transactions.add({
			accountId,
			date: new Date(),
			amount: 50,
			rawMerchantString: "AMZN Purchase",
			merchantId,
			importedAt: new Date(),
			importMonth: "2026-01",
		});
		await db.categories.add({
			name: "Shopping",
			slug: "shopping",
			color: "#ff0000",
			icon: "bag",
			parentId: null,
			sortOrder: 0,
			createdAt: new Date(),
		});
		await db.subscriptions.add({
			merchantId,
			merchantName: "Amazon",
			typicalAmount: 14.99,
			frequency: "monthly",
			intervalDays: 30,
			lastChargeDate: "2026-01-15",
			firstChargeDate: "2025-06-15",
			chargeCount: 8,
			status: "active",
			transactionIds: [1],
			detectedAt: "2026-01-01",
			updatedAt: "2026-01-15",
		});
		await db.settings.add({ key: "currency_symbol", value: "$" });

		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.accounts).toHaveLength(1);
		expect(data.transactions).toHaveLength(1);
		expect(data.merchants).toHaveLength(1);
		expect(data.rules).toHaveLength(1);
		expect(data.categories).toHaveLength(1);
		expect(data.subscriptions).toHaveLength(1);
		expect(data.settings).toHaveLength(1);
		expect(data.metadata.recordCounts.accounts).toBe(1);
		expect(data.metadata.recordCounts.transactions).toBe(1);
		expect(data.metadata.recordCounts.merchants).toBe(1);
		expect(data.metadata.recordCounts.rules).toBe(1);
	});

	it("preserves merchant-rule relationships", async () => {
		const merchantId = await db.merchants.add({
			name: "Netflix",
			createdAt: new Date(),
			firstSeen: new Date(),
		});
		await db.rules.add({
			merchantId,
			pattern: "NETFLIX.*",
			matchCount: 3,
			createdAt: new Date(),
		});
		await db.rules.add({
			merchantId,
			pattern: "NFLX.*",
			matchCount: 1,
			createdAt: new Date(),
		});

		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.rules).toHaveLength(2);
		expect(data.rules.every((r) => r.merchantId === merchantId)).toBe(true);
		expect(data.merchants[0].name).toBe("Netflix");
	});

	it("preserves linked refund relationships", async () => {
		const originalId = await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: 100,
			rawMerchantString: "Store",
			importedAt: new Date(),
			importMonth: "2026-01",
		});
		await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: -100,
			rawMerchantString: "Store Refund",
			importedAt: new Date(),
			importMonth: "2026-01",
			isRefund: true,
			linkedRefundId: originalId,
		});

		const blob = await exportAllData();
		const data = await blobToJson(blob);
		const refund = data.transactions.find((t) => t.isRefund);

		expect(refund).toBeDefined();
		expect(refund?.linkedRefundId).toBe(originalId);
	});

	it("handles unicode and special characters in merchant strings", async () => {
		await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: 25,
			rawMerchantString: 'Café Résumé 日本語 "quotes" & <special>',
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const blob = await exportAllData();
		const data = await blobToJson(blob);

		expect(data.transactions[0].rawMerchantString).toBe(
			'Café Résumé 日本語 "quotes" & <special>',
		);
	});

	it("10,000+ transactions export completes within 5 seconds", async () => {
		const txBatch = Array.from({ length: 10_000 }, (_, i) => ({
			accountId: 1,
			date: new Date(),
			amount: i,
			rawMerchantString: `Merchant ${i}`,
			importedAt: new Date(),
			importMonth: "2026-01",
		}));
		await db.transactions.bulkAdd(txBatch);

		const start = performance.now();
		const blob = await exportAllData();
		const elapsed = performance.now() - start;

		const data = await blobToJson(blob);
		expect(data.transactions).toHaveLength(10_000);
		expect(data.metadata.recordCounts.transactions).toBe(10_000);
		expect(elapsed).toBeLessThan(5_000);
	}, 10_000);

	it("selective export: only transactions yields empty other arrays", async () => {
		await db.accounts.add({
			name: "A",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.merchants.add({
			name: "M",
			createdAt: new Date(),
			firstSeen: new Date(),
		});
		await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: 5,
			rawMerchantString: "Test",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const blob = await exportAllData({
			includeAccounts: false,
			includeMerchants: false,
			includeRules: false,
			includeCategories: false,
			includeSubscriptions: false,
			includeSettings: false,
		});
		const data = await blobToJson(blob);

		expect(data.transactions).toHaveLength(1);
		expect(data.accounts).toEqual([]);
		expect(data.merchants).toEqual([]);
		expect(data.rules).toEqual([]);
		expect(data.categories).toEqual([]);
		expect(data.subscriptions).toEqual([]);
		expect(data.settings).toEqual([]);
		expect(data.appSettings).toEqual([]);
	});
});
