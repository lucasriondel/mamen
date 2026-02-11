import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { APP_VERSION } from "@/lib/constants";
import { db } from "@/lib/db";
import type { ExportData, ExportMetadata } from "../types/export.types";
import {
	importDataMerge,
	importDataReplace,
	parseBackupFile,
} from "./importService";

const clearDb = async (): Promise<void> => {
	await db.accounts.clear();
	await db.transactions.clear();
	await db.merchants.clear();
	await db.rules.clear();
	await db.settings.clear();
	await db.appSettings.clear();
	await db.categories.clear();
	await db.subscriptions.clear();
};

const makeMetadata = (overrides?: Partial<ExportMetadata>): ExportMetadata => ({
	exportDate: "2026-01-22T00:00:00.000Z",
	appVersion: APP_VERSION,
	exportFormat: "mamen-backup-v1",
	recordCounts: {
		accounts: 1,
		transactions: 1,
		merchants: 1,
		rules: 0,
		categories: 0,
		subscriptions: 0,
		settings: 0,
		appSettings: 0,
	},
	...overrides,
});

const makeBackup = (overrides?: Partial<ExportData>): ExportData => ({
	metadata: makeMetadata(),
	accounts: [
		{
			id: 1,
			name: "Checking",
			type: "checking",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	],
	transactions: [
		{
			id: 1,
			accountId: 1,
			date: "2026-01-15",
			amount: 42.5,
			rawMerchantString: "AMZN Marketplace",
			importedAt: new Date().toISOString(),
			importMonth: "2026-01",
		},
	],
	merchants: [
		{
			id: 1,
			name: "Amazon",
			createdAt: new Date().toISOString(),
			firstSeen: new Date().toISOString(),
		},
	],
	rules: [],
	categories: [],
	subscriptions: [],
	settings: [],
	appSettings: [],
	...overrides,
});

const makeFile = (content: string): File => {
	const file = new File([content], "backup.json", { type: "application/json" });
	// jsdom File.text() doesn't work reliably -- provide a working implementation
	file.text = () => Promise.resolve(content);
	return file;
};
const makeBackupFile = (data: ExportData): File =>
	makeFile(JSON.stringify(data));

describe("parseBackupFile", () => {
	it("valid backup file returns correct preview with counts", async () => {
		const data = makeBackup();
		const preview = await parseBackupFile(makeBackupFile(data));

		expect(preview.isValidFormat).toBe(true);
		expect(preview.validationErrors).toEqual([]);
		expect(preview.metadata).not.toBeNull();
		expect(preview.recordCounts.accounts).toBe(1);
		expect(preview.recordCounts.transactions).toBe(1);
		expect(preview.recordCounts.merchants).toBe(1);
	});

	it("non-JSON file returns isValidFormat=false with error message", async () => {
		const preview = await parseBackupFile(makeFile("not json at all"));

		expect(preview.isValidFormat).toBe(false);
		expect(preview.validationErrors).toContain("File is not valid JSON");
		expect(preview.metadata).toBeNull();
	});

	it("JSON without metadata returns validation error", async () => {
		const preview = await parseBackupFile(
			makeFile(JSON.stringify({ accounts: [] })),
		);

		expect(preview.isValidFormat).toBe(false);
		expect(preview.validationErrors.length).toBeGreaterThan(0);
	});

	it("JSON with wrong structure returns specific Zod errors", async () => {
		const preview = await parseBackupFile(
			makeFile(
				JSON.stringify({
					metadata: { exportDate: "2026-01-01" },
					accounts: [],
				}),
			),
		);

		expect(preview.isValidFormat).toBe(false);
		expect(preview.validationErrors.some((e) => e.includes("metadata"))).toBe(
			true,
		);
	});

	it("newer version detected correctly", async () => {
		const data = makeBackup({
			metadata: makeMetadata({ appVersion: "99.0.0" }),
		});
		const preview = await parseBackupFile(makeBackupFile(data));

		expect(preview.isNewerVersion).toBe(true);
		expect(preview.isValidFormat).toBe(true);
	});

	it("same version returns isNewerVersion=false", async () => {
		const data = makeBackup({
			metadata: makeMetadata({ appVersion: APP_VERSION }),
		});
		const preview = await parseBackupFile(makeBackupFile(data));

		expect(preview.isNewerVersion).toBe(false);
	});

	it("older version returns isNewerVersion=false", async () => {
		const data = makeBackup({
			metadata: makeMetadata({ appVersion: "0.0.1" }),
		});
		const preview = await parseBackupFile(makeBackupFile(data));

		expect(preview.isNewerVersion).toBe(false);
	});

	it("empty file returns appropriate error", async () => {
		const preview = await parseBackupFile(makeFile(""));

		expect(preview.isValidFormat).toBe(false);
		expect(preview.validationErrors).toContain("File is empty");
	});
});

describe("importDataReplace", () => {
	beforeEach(async () => {
		await clearDb();
	});

	it("clears existing data completely", async () => {
		await db.accounts.add({
			name: "Old",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.transactions.add({
			accountId: 1,
			date: new Date(),
			amount: 100,
			rawMerchantString: "Old",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		await importDataReplace(makeBackup());

		const accounts = await db.accounts.toArray();
		expect(accounts).toHaveLength(1);
		expect(accounts[0].name).toBe("Checking");
	});

	it("imports all records from backup", async () => {
		const data = makeBackup();
		const result = await importDataReplace(data);

		expect(result.success).toBe(true);
		expect(await db.accounts.count()).toBe(1);
		expect(await db.transactions.count()).toBe(1);
		expect(await db.merchants.count()).toBe(1);
	});

	it("returns correct added counts", async () => {
		const result = await importDataReplace(makeBackup());

		expect(result.added.accounts).toBe(1);
		expect(result.added.transactions).toBe(1);
		expect(result.added.merchants).toBe(1);
		expect(result.skipped.transactions).toBe(0);
	});

	it("preserves all transaction fields (anomalyFlags, isRefund, linkedRefundId)", async () => {
		const data = makeBackup({
			transactions: [
				{
					id: 1,
					accountId: 1,
					date: "2026-01-15",
					amount: 999,
					rawMerchantString: "Big Purchase",
					importedAt: new Date().toISOString(),
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
					duplicateNote: "Dup",
				},
			],
		});

		await importDataReplace(data);
		const tx = await db.transactions.get(1);

		expect(tx!.isRefund).toBe(true);
		expect(tx!.linkedRefundId).toBe(42);
		expect(tx!.anomalyFlags).toHaveLength(1);
		expect(tx!.isDuplicateExcluded).toBe(true);
	});

	it("preserves merchant-rule relationships (merchantId on rules)", async () => {
		const data = makeBackup({
			merchants: [
				{
					id: 5,
					name: "Netflix",
					createdAt: new Date().toISOString(),
					firstSeen: new Date().toISOString(),
				},
			],
			rules: [
				{
					id: 1,
					merchantId: 5,
					pattern: "NFLX.*",
					matchCount: 3,
					createdAt: new Date().toISOString(),
				},
			],
		});

		await importDataReplace(data);
		const rule = await db.rules.get(1);

		expect(rule!.merchantId).toBe(5);
	});

	it("handles empty backup (imports nothing, clears all)", async () => {
		await db.accounts.add({
			name: "Old",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const data = makeBackup({
			metadata: makeMetadata({
				recordCounts: {
					accounts: 0,
					transactions: 0,
					merchants: 0,
					rules: 0,
					categories: 0,
					subscriptions: 0,
					settings: 0,
					appSettings: 0,
				},
			}),
			accounts: [],
			transactions: [],
			merchants: [],
			rules: [],
		});

		const result = await importDataReplace(data);

		expect(result.success).toBe(true);
		expect(result.added.accounts).toBe(0);
		expect(await db.accounts.count()).toBe(0);
	});

	it("replace mode keeps original IDs", async () => {
		const data = makeBackup({
			accounts: [
				{
					id: 42,
					name: "Special",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		});

		await importDataReplace(data);
		const account = await db.accounts.get(42);

		expect(account).toBeDefined();
		expect(account!.name).toBe("Special");
	});
});

describe("importDataMerge", () => {
	beforeEach(async () => {
		await clearDb();
	});

	it("adds new accounts, skips existing", async () => {
		await db.accounts.add({
			name: "Existing",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const data = makeBackup({
			accounts: [
				{
					id: 10,
					name: "Existing",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					id: 11,
					name: "New",
					type: "savings",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			transactions: [],
			merchants: [],
		});

		const result = await importDataMerge(data);

		expect(result.added.accounts).toBe(1);
		expect(await db.accounts.count()).toBe(2);
	});

	it("adds new merchants, skips existing", async () => {
		await db.merchants.add({
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		});

		const data = makeBackup({
			accounts: [],
			transactions: [],
			merchants: [
				{
					id: 10,
					name: "Amazon",
					createdAt: new Date().toISOString(),
					firstSeen: new Date().toISOString(),
				},
				{
					id: 11,
					name: "Netflix",
					createdAt: new Date().toISOString(),
					firstSeen: new Date().toISOString(),
				},
			],
		});

		const result = await importDataMerge(data);

		expect(result.added.merchants).toBe(1);
		expect(await db.merchants.count()).toBe(2);
	});

	it("deduplicates transactions by composite key", async () => {
		const txDate = "2026-01-15";
		const acctId = await db.accounts.add({
			name: "Checking",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.transactions.add({
			accountId: acctId,
			date: txDate,
			amount: 42.5,
			rawMerchantString: "AMZN",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const data = makeBackup({
			accounts: [
				{
					id: 1,
					name: "Checking",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			transactions: [
				{
					id: 100,
					accountId: 1,
					date: txDate,
					amount: 42.5,
					rawMerchantString: "AMZN",
					importedAt: new Date().toISOString(),
					importMonth: "2026-01",
				},
			],
			merchants: [],
		});

		const result = await importDataMerge(data);

		expect(result.skipped.transactions).toBe(1);
		expect(result.added.transactions).toBe(0);
		expect(await db.transactions.count()).toBe(1);
	});

	it("tracks correct skipped count", async () => {
		const txDate = "2026-01-15";
		const acctId = await db.accounts.add({
			name: "Checking",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.transactions.add({
			accountId: acctId,
			date: txDate,
			amount: 10,
			rawMerchantString: "Store A",
			importedAt: new Date(),
			importMonth: "2026-01",
		});
		await db.transactions.add({
			accountId: acctId,
			date: txDate,
			amount: 20,
			rawMerchantString: "Store B",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const data = makeBackup({
			accounts: [
				{
					id: 1,
					name: "Checking",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			transactions: [
				{
					id: 100,
					accountId: 1,
					date: txDate,
					amount: 10,
					rawMerchantString: "Store A",
					importedAt: new Date().toISOString(),
					importMonth: "2026-01",
				},
				{
					id: 101,
					accountId: 1,
					date: txDate,
					amount: 20,
					rawMerchantString: "Store B",
					importedAt: new Date().toISOString(),
					importMonth: "2026-01",
				},
				{
					id: 102,
					accountId: 1,
					date: txDate,
					amount: 30,
					rawMerchantString: "Store C",
					importedAt: new Date().toISOString(),
					importMonth: "2026-01",
				},
			],
			merchants: [],
		});

		const result = await importDataMerge(data);

		expect(result.skipped.transactions).toBe(2);
		expect(result.added.transactions).toBe(1);
	});

	it("with completely new data imports everything", async () => {
		const data = makeBackup();
		const result = await importDataMerge(data);

		expect(result.added.accounts).toBe(1);
		expect(result.added.transactions).toBe(1);
		expect(result.added.merchants).toBe(1);
		expect(result.skipped.transactions).toBe(0);
	});

	it("with completely duplicate data skips everything", async () => {
		const acctId = await db.accounts.add({
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
		await db.transactions.add({
			accountId: acctId,
			date: "2026-01-15",
			amount: 42.5,
			rawMerchantString: "AMZN Marketplace",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const data = makeBackup();
		const result = await importDataMerge(data);

		expect(result.added.accounts).toBe(0);
		expect(result.added.merchants).toBe(0);
		expect(result.skipped.transactions).toBe(1);
	});

	it("preserves existing data untouched", async () => {
		await db.accounts.add({
			name: "MyAccount",
			type: "savings",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const data = makeBackup({
			accounts: [
				{
					id: 100,
					name: "OtherAccount",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			transactions: [],
			merchants: [],
		});

		await importDataMerge(data);

		const accounts = await db.accounts.toArray();
		expect(accounts).toHaveLength(2);
		expect(accounts.find((a) => a.name === "MyAccount")).toBeDefined();
		expect(accounts.find((a) => a.name === "OtherAccount")).toBeDefined();
	});

	it("merged accounts get new IDs", async () => {
		const data = makeBackup({
			accounts: [
				{
					id: 999,
					name: "NewAccount",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			transactions: [],
			merchants: [],
		});

		await importDataMerge(data);

		const account = await db.accounts
			.where("name")
			.equals("NewAccount")
			.first();
		expect(account).toBeDefined();
		expect(account!.id).not.toBe(999);
	});

	it("merged transactions have remapped accountId", async () => {
		const data = makeBackup({
			accounts: [
				{
					id: 50,
					name: "Imported",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			transactions: [
				{
					id: 100,
					accountId: 50,
					date: "2026-02-01",
					amount: 25,
					rawMerchantString: "Test",
					importedAt: new Date().toISOString(),
					importMonth: "2026-02",
				},
			],
			merchants: [],
		});

		await importDataMerge(data);

		const account = await db.accounts.where("name").equals("Imported").first();
		const txns = await db.transactions.toArray();
		expect(txns).toHaveLength(1);
		expect(txns[0].accountId).toBe(account!.id);
	});

	it("merged rules have remapped merchantId", async () => {
		const data = makeBackup({
			accounts: [],
			transactions: [],
			merchants: [
				{
					id: 50,
					name: "Netflix",
					createdAt: new Date().toISOString(),
					firstSeen: new Date().toISOString(),
				},
			],
			rules: [
				{
					id: 1,
					merchantId: 50,
					pattern: "NFLX.*",
					matchCount: 3,
					createdAt: new Date().toISOString(),
				},
			],
		});

		await importDataMerge(data);

		const merchant = await db.merchants.where("name").equals("Netflix").first();
		const rules = await db.rules.toArray();
		expect(rules).toHaveLength(1);
		expect(rules[0].merchantId).toBe(merchant!.id);
	});

	it("merged transactions have remapped linkedRefundId (refund links preserved)", async () => {
		const data = makeBackup({
			accounts: [
				{
					id: 1,
					name: "Checking",
					type: "checking",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			transactions: [
				{
					id: 100,
					accountId: 1,
					date: "2026-01-10",
					amount: 50,
					rawMerchantString: "Store",
					importedAt: new Date().toISOString(),
					importMonth: "2026-01",
				},
				{
					id: 101,
					accountId: 1,
					date: "2026-01-12",
					amount: -50,
					rawMerchantString: "Store Refund",
					importedAt: new Date().toISOString(),
					importMonth: "2026-01",
					isRefund: true,
					linkedRefundId: 100,
				},
			],
			merchants: [],
		});

		await importDataMerge(data);

		const txns = await db.transactions.toArray();
		expect(txns).toHaveLength(2);

		const refund = txns.find((t) => t.isRefund);
		const original = txns.find((t) => !t.isRefund);
		expect(refund).toBeDefined();
		expect(refund!.linkedRefundId).toBe(original!.id);
	});

	it("settings merge overwrites existing", async () => {
		await db.settings.add({ key: "theme", value: "light" });

		const data = makeBackup({
			accounts: [],
			transactions: [],
			merchants: [],
			settings: [{ id: 1, key: "theme", value: "dark" }],
		});

		await importDataMerge(data);

		const settings = await db.settings.toArray();
		const theme = settings.find((s) => s.key === "theme");
		expect(theme!.value).toBe("dark");
	});
});

describe("importDataReplace - integration", () => {
	beforeEach(async () => {
		await clearDb();
	});

	it("full replace import: create backup JSON -> import replace -> verify all data", async () => {
		const data = makeBackup({
			metadata: makeMetadata({
				recordCounts: {
					accounts: 2,
					transactions: 3,
					merchants: 1,
					rules: 1,
					categories: 1,
					subscriptions: 0,
					settings: 1,
					appSettings: 0,
				},
			}),
			accounts: [
				{
					id: 1,
					name: "Checking",
					type: "checking",
					createdAt: "2026-01-01",
					updatedAt: "2026-01-01",
				},
				{
					id: 2,
					name: "Savings",
					type: "savings",
					createdAt: "2026-01-01",
					updatedAt: "2026-01-01",
				},
			],
			transactions: [
				{
					id: 1,
					accountId: 1,
					date: "2026-01-01",
					amount: 10,
					rawMerchantString: "A",
					importedAt: "2026-01-01",
					importMonth: "2026-01",
				},
				{
					id: 2,
					accountId: 1,
					date: "2026-01-02",
					amount: 20,
					rawMerchantString: "B",
					importedAt: "2026-01-01",
					importMonth: "2026-01",
				},
				{
					id: 3,
					accountId: 2,
					date: "2026-01-03",
					amount: 30,
					rawMerchantString: "C",
					importedAt: "2026-01-01",
					importMonth: "2026-01",
				},
			],
			merchants: [
				{
					id: 1,
					name: "Amazon",
					createdAt: "2026-01-01",
					firstSeen: "2026-01-01",
				},
			],
			rules: [
				{
					id: 1,
					merchantId: 1,
					pattern: "AMZN.*",
					matchCount: 5,
					createdAt: "2026-01-01",
				},
			],
			categories: [
				{
					id: 1,
					name: "Shopping",
					slug: "shopping",
					color: "#ff0",
					icon: "bag",
					parentId: null,
					sortOrder: 0,
					createdAt: "2026-01-01",
				},
			],
			settings: [{ id: 1, key: "currency", value: "$" }],
		});

		const result = await importDataReplace(data);

		expect(result.success).toBe(true);
		expect(result.mode).toBe("replace");
		expect(await db.accounts.count()).toBe(2);
		expect(await db.transactions.count()).toBe(3);
		expect(await db.merchants.count()).toBe(1);
		expect(await db.rules.count()).toBe(1);
		expect(await db.categories.count()).toBe(1);
		expect(await db.settings.count()).toBe(1);
	});

	it("relationship preservation (replace): linked refunds intact", async () => {
		const data = makeBackup({
			accounts: [
				{
					id: 1,
					name: "Checking",
					type: "checking",
					createdAt: "2026-01-01",
					updatedAt: "2026-01-01",
				},
			],
			transactions: [
				{
					id: 1,
					accountId: 1,
					date: "2026-01-10",
					amount: 100,
					rawMerchantString: "Store",
					importedAt: "2026-01-01",
					importMonth: "2026-01",
				},
				{
					id: 2,
					accountId: 1,
					date: "2026-01-12",
					amount: -100,
					rawMerchantString: "Store Refund",
					importedAt: "2026-01-01",
					importMonth: "2026-01",
					isRefund: true,
					linkedRefundId: 1,
				},
			],
			merchants: [],
		});

		await importDataReplace(data);

		const refund = await db.transactions.get(2);
		expect(refund!.linkedRefundId).toBe(1);
		expect(refund!.isRefund).toBe(true);
	});

	it("empty backup: replace clears database", async () => {
		await db.accounts.add({
			name: "Old",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const data = makeBackup({
			metadata: makeMetadata({
				recordCounts: {
					accounts: 0,
					transactions: 0,
					merchants: 0,
					rules: 0,
					categories: 0,
					subscriptions: 0,
					settings: 0,
					appSettings: 0,
				},
			}),
			accounts: [],
			transactions: [],
			merchants: [],
			rules: [],
			categories: [],
			subscriptions: [],
			settings: [],
			appSettings: [],
		});

		const result = await importDataReplace(data);

		expect(result.success).toBe(true);
		expect(await db.accounts.count()).toBe(0);
	});
});

describe("importDataMerge - integration", () => {
	beforeEach(async () => {
		await clearDb();
	});

	it("mixed merge: some overlap, reports correct added/skipped", async () => {
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
		await db.transactions.add({
			accountId: 1,
			date: "2026-01-15",
			amount: 42.5,
			rawMerchantString: "AMZN",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const data = makeBackup({
			accounts: [
				{
					id: 1,
					name: "Checking",
					type: "checking",
					createdAt: "2026-01-01",
					updatedAt: "2026-01-01",
				},
				{
					id: 2,
					name: "Savings",
					type: "savings",
					createdAt: "2026-01-01",
					updatedAt: "2026-01-01",
				},
			],
			transactions: [
				{
					id: 100,
					accountId: 1,
					date: "2026-01-15",
					amount: 42.5,
					rawMerchantString: "AMZN",
					importedAt: "2026-01-01",
					importMonth: "2026-01",
				},
				{
					id: 101,
					accountId: 2,
					date: "2026-01-20",
					amount: 99,
					rawMerchantString: "New Store",
					importedAt: "2026-01-01",
					importMonth: "2026-01",
				},
			],
			merchants: [
				{
					id: 1,
					name: "Amazon",
					createdAt: "2026-01-01",
					firstSeen: "2026-01-01",
				},
				{
					id: 2,
					name: "Netflix",
					createdAt: "2026-01-01",
					firstSeen: "2026-01-01",
				},
			],
		});

		const result = await importDataMerge(data);

		expect(result.added.accounts).toBe(1);
		expect(result.added.merchants).toBe(1);
		expect(result.added.transactions).toBe(1);
		expect(result.skipped.transactions).toBe(1);
	});

	it("relationship preservation (merge): merchant-rule remapped correctly", async () => {
		const data = makeBackup({
			accounts: [],
			transactions: [],
			merchants: [
				{
					id: 50,
					name: "TestMerchant",
					createdAt: "2026-01-01",
					firstSeen: "2026-01-01",
				},
			],
			rules: [
				{
					id: 1,
					merchantId: 50,
					pattern: "TEST.*",
					matchCount: 1,
					createdAt: "2026-01-01",
				},
			],
		});

		await importDataMerge(data);

		const merchant = await db.merchants
			.where("name")
			.equals("TestMerchant")
			.first();
		const rules = await db.rules.toArray();
		expect(rules[0].merchantId).toBe(merchant!.id);
	});
});
