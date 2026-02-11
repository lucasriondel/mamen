import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Merchant, Transaction } from "@/types";
import {
	buildReason,
	cleanExpiredNewMerchantFlags,
	confirmDuplicate,
	DUPLICATE_WINDOW_DAYS,
	detectHighAmountAnomalies,
	detectNewMerchantAnomalies,
	detectPotentialDuplicates,
	dismissAnomaly,
	dismissDuplicateAnomaly,
	getAnomalySettings,
	NEW_MERCHANT_THRESHOLD_DAYS,
	undoConfirmDuplicate,
	undoDismissAnomaly,
	undoDismissDuplicateAnomaly,
} from "./anomalyDetector";

const createTransaction = (
	overrides: Partial<Transaction> = {},
): Omit<Transaction, "id"> => ({
	accountId: 1,
	date: new Date("2026-01-15"),
	amount: -100,
	rawMerchantString: "TEST STORE",
	categoryId: 1,
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

const daysAgo = (n: number): Date => {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
};

const createMerchant = (
	overrides: Partial<Merchant> = {},
): Omit<Merchant, "id"> => ({
	name: "Test Merchant",
	createdAt: new Date(),
	firstSeen: new Date(),
	...overrides,
});

beforeEach(async () => {
	await db.transactions.clear();
	await db.accounts.clear();
	await db.merchants.clear();
	await db.categories.clear();
	await db.settings.clear();
});

describe("getAnomalySettings", () => {
	it("returns default settings when none stored", async () => {
		const settings = await getAnomalySettings();
		expect(settings).toEqual({
			multiplierThreshold: 2,
			absoluteThreshold: null,
			minTransactionsForDetection: 5,
		});
	});

	it("returns stored settings", async () => {
		await db.settings.add({
			key: "anomaly_settings",
			value: JSON.stringify({
				multiplierThreshold: 3,
				absoluteThreshold: 500,
				minTransactionsForDetection: 10,
			}),
		});

		const settings = await getAnomalySettings();
		expect(settings.multiplierThreshold).toBe(3);
		expect(settings.absoluteThreshold).toBe(500);
		expect(settings.minTransactionsForDetection).toBe(10);
	});
});

describe("buildReason", () => {
	it("formats reason string correctly", () => {
		const reason = buildReason(-400, 130, "Shopping");
		expect(reason).toContain("400");
		expect(reason).toContain("3.1x");
		expect(reason).toContain("Shopping");
		expect(reason).toContain("130");
	});
});

describe("detectHighAmountAnomalies", () => {
	const setupCategory = async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.categories.add({
			id: 1,
			name: "Shopping",
			slug: "shopping",
			color: "#000",
			icon: "cart",
			parentId: null,
			sortOrder: 0,
			createdAt: new Date(),
		});
	};

	it("flags transaction at 3x average with 2x threshold", async () => {
		await setupCategory();

		// 5 transactions at ~EUR100, 1 at EUR300 (3x average)
		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -90 }),
			createTransaction({ amount: -110 }),
			createTransaction({ amount: -95 }),
			createTransaction({ amount: -105 }),
			createTransaction({ amount: -300 }),
		]);

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(1);

		const allTx = await db.transactions.toArray();
		const flagged = allTx.filter((tx) =>
			tx.anomalyFlags?.some((f) => f.type === "high-amount" && !f.dismissed),
		);
		expect(flagged).toHaveLength(1);
		expect(flagged[0].amount).toBe(-300);
	});

	it("does not flag category with less than 5 transactions", async () => {
		await setupCategory();

		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -90 }),
			createTransaction({ amount: -110 }),
			createTransaction({ amount: -500 }),
		]);

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(0);
		expect(result.skippedCategories).toBe(1);
	});

	it("does not flag transaction at 1.5x average with 2x threshold", async () => {
		await setupCategory();

		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -150 }),
		]);

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("flags transaction at 2.5x average with 2x threshold", async () => {
		await setupCategory();

		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -250 }),
		]);

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(1);
	});

	it("flags via absolute threshold even if below multiplier", async () => {
		await setupCategory();
		await db.settings.add({
			key: "anomaly_settings",
			value: JSON.stringify({
				multiplierThreshold: 10,
				absoluteThreshold: 500,
				minTransactionsForDetection: 5,
			}),
		});

		await db.transactions.bulkAdd([
			createTransaction({ amount: -400 }),
			createTransaction({ amount: -400 }),
			createTransaction({ amount: -400 }),
			createTransaction({ amount: -400 }),
			createTransaction({ amount: -400 }),
			createTransaction({ amount: -600 }),
		]);

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(1);

		const allTx = await db.transactions.toArray();
		const flaggedTx = allTx.find((tx) => tx.anomalyFlags?.length);
		expect(flaggedTx?.amount).toBe(-600);
	});

	it("does not re-flag already-flagged transaction", async () => {
		await setupCategory();

		const txId = await db.transactions.add(createTransaction({ amount: -300 }));
		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
		]);

		// Manually add a flag
		await db.transactions.update(txId, {
			anomalyFlags: [
				{
					type: "high-amount",
					reason: "Already flagged",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: false,
				},
			],
		});

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(0);

		const tx = await db.transactions.get(txId);
		expect(tx?.anomalyFlags).toHaveLength(1);
		expect(tx?.anomalyFlags?.[0].reason).toBe("Already flagged");
	});

	it("does not re-flag dismissed transaction", async () => {
		await setupCategory();

		const txId = await db.transactions.add(createTransaction({ amount: -300 }));
		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
		]);

		await db.transactions.update(txId, {
			anomalyFlags: [
				{
					type: "high-amount",
					reason: "Dismissed",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: true,
					dismissedAt: "2026-01-02T00:00:00.000Z",
				},
			],
		});

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("excludes refund transactions from detection", async () => {
		await setupCategory();

		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -300, isRefund: true }),
		]);

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("excludes uncategorized transactions from detection", async () => {
		await setupCategory();

		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -300, categoryId: undefined }),
		]);

		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("computes category average excluding refunds", async () => {
		await setupCategory();

		// 5 expenses at 100, 1 refund at 30 (should be excluded from average), 1 expense at 250
		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: 30, isRefund: true }),
			createTransaction({ amount: -250 }),
		]);

		// Without refund, average of the 5 others (excluding the -250 itself) = 100
		// 250 / 100 = 2.5x -> flagged
		const result = await detectHighAmountAnomalies();
		expect(result.flagged).toBe(1);
	});

	it("generates correct reason string format", async () => {
		await setupCategory();

		await db.transactions.bulkAdd([
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -100 }),
			createTransaction({ amount: -400 }),
		]);

		await detectHighAmountAnomalies();

		const allTx = await db.transactions.toArray();
		const flagged = allTx.find((tx) => tx.anomalyFlags?.length);
		expect(flagged).toBeDefined();
		expect(flagged?.anomalyFlags?.[0].reason).toContain("Shopping");
		expect(flagged?.anomalyFlags?.[0].reason).toContain("4x");
	});
});

describe("dismissAnomaly", () => {
	beforeEach(async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("sets dismissed to true and adds dismissedAt", async () => {
		const txId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "high-amount",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
					},
				],
			}),
		);

		await dismissAnomaly(txId, "high-amount");

		const tx = await db.transactions.get(txId);
		expect(tx?.anomalyFlags?.[0].dismissed).toBe(true);
		expect(tx?.anomalyFlags?.[0].dismissedAt).toBeDefined();
	});

	it("does not affect other flag types", async () => {
		const txId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "high-amount",
						reason: "High",
						detectedAt: "2026-01-01",
						dismissed: false,
					},
					{
						type: "new-merchant",
						reason: "New",
						detectedAt: "2026-01-01",
						dismissed: false,
					},
				],
			}),
		);

		await dismissAnomaly(txId, "high-amount");

		const tx = await db.transactions.get(txId);
		expect(tx?.anomalyFlags?.[0].dismissed).toBe(true);
		expect(tx?.anomalyFlags?.[1].dismissed).toBe(false);
	});
});

describe("undoDismissAnomaly", () => {
	beforeEach(async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("restores dismissed flag", async () => {
		const txId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "high-amount",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: true,
						dismissedAt: "2026-01-02T00:00:00.000Z",
					},
				],
			}),
		);

		await undoDismissAnomaly(txId, "high-amount");

		const tx = await db.transactions.get(txId);
		expect(tx?.anomalyFlags?.[0].dismissed).toBe(false);
		expect(tx?.anomalyFlags?.[0].dismissedAt).toBeUndefined();
	});
});

describe("NEW_MERCHANT_THRESHOLD_DAYS", () => {
	it("exports the constant with value 30", () => {
		expect(NEW_MERCHANT_THRESHOLD_DAYS).toBe(30);
	});
});

describe("detectNewMerchantAnomalies", () => {
	beforeEach(async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("flags transactions for merchant created 10 days ago", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "Amazon",
				createdAt: daysAgo(10),
				firstSeen: daysAgo(10),
			}),
		);
		await db.transactions.add(
			createTransaction({ merchantId, rawMerchantString: "AMAZON" }),
		);

		const result = await detectNewMerchantAnomalies();
		expect(result.flagged).toBe(1);

		const allTx = await db.transactions.toArray();
		const flagged = allTx.filter((tx) =>
			tx.anomalyFlags?.some((f) => f.type === "new-merchant" && !f.dismissed),
		);
		expect(flagged).toHaveLength(1);
	});

	it("does NOT flag transactions for merchant created 31 days ago", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "OldShop",
				createdAt: daysAgo(31),
				firstSeen: daysAgo(31),
			}),
		);
		await db.transactions.add(
			createTransaction({ merchantId, rawMerchantString: "OLD SHOP" }),
		);

		const result = await detectNewMerchantAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("does NOT flag transactions for merchant created exactly 30 days ago", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "Borderline",
				createdAt: daysAgo(30),
				firstSeen: daysAgo(30),
			}),
		);
		await db.transactions.add(
			createTransaction({ merchantId, rawMerchantString: "BORDERLINE" }),
		);

		const result = await detectNewMerchantAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("does NOT flag unmatched transaction (no merchantId)", async () => {
		await db.transactions.add(
			createTransaction({
				merchantId: undefined,
				rawMerchantString: "UNKNOWN",
			}),
		);

		const result = await detectNewMerchantAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("does not re-flag already-flagged transaction", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "NewShop",
				createdAt: daysAgo(5),
				firstSeen: daysAgo(5),
			}),
		);
		const txId = await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "NEWSHOP",
				anomalyFlags: [
					{
						type: "new-merchant",
						reason: "Already flagged",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
					},
				],
			}),
		);

		const result = await detectNewMerchantAnomalies();
		expect(result.flagged).toBe(0);

		const tx = await db.transactions.get(txId);
		expect(tx?.anomalyFlags).toHaveLength(1);
		expect(tx?.anomalyFlags?.[0].reason).toBe("Already flagged");
	});

	it("does not re-flag dismissed new-merchant flag", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "DismissedShop",
				createdAt: daysAgo(3),
				firstSeen: daysAgo(3),
			}),
		);
		await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "DISMISSEDSHOP",
				anomalyFlags: [
					{
						type: "new-merchant",
						reason: "Dismissed",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: true,
						dismissedAt: "2026-01-02T00:00:00.000Z",
					},
				],
			}),
		);

		const result = await detectNewMerchantAnomalies();
		expect(result.flagged).toBe(0);
	});

	it("preserves both high-amount and new-merchant flags on same transaction", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "NewExpensive",
				createdAt: daysAgo(2),
				firstSeen: daysAgo(2),
			}),
		);
		const txId = await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "NEWEXPENSIVE",
				anomalyFlags: [
					{
						type: "high-amount",
						reason: "High amount test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
					},
				],
			}),
		);

		const result = await detectNewMerchantAnomalies();
		expect(result.flagged).toBe(1);

		const tx = await db.transactions.get(txId);
		expect(tx?.anomalyFlags).toHaveLength(2);
		expect(tx?.anomalyFlags?.map((f) => f.type).sort()).toEqual([
			"high-amount",
			"new-merchant",
		]);
	});

	it("generates correct reason string format", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "Amazon",
				createdAt: daysAgo(5),
				firstSeen: daysAgo(5),
			}),
		);
		await db.transactions.add(
			createTransaction({ merchantId, rawMerchantString: "AMAZON" }),
		);

		await detectNewMerchantAnomalies();

		const allTx = await db.transactions.toArray();
		const flagged = allTx.find((tx) =>
			tx.anomalyFlags?.some((f) => f.type === "new-merchant"),
		);
		expect(flagged).toBeDefined();
		expect(flagged?.anomalyFlags?.[0].reason).toBe(
			"First seen merchant - Amazon created 5 days ago",
		);
	});
});

describe("cleanExpiredNewMerchantFlags", () => {
	beforeEach(async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("removes active new-merchant flags from aged-out merchant transactions", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "OldMerchant",
				createdAt: daysAgo(31),
				firstSeen: daysAgo(31),
			}),
		);
		await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "OLD MERCHANT",
				anomalyFlags: [
					{
						type: "new-merchant",
						reason: "First seen merchant - OldMerchant created 5 days ago",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
					},
				],
			}),
		);

		const result = await cleanExpiredNewMerchantFlags();
		expect(result.cleaned).toBe(1);

		const allTx = await db.transactions.toArray();
		expect(allTx[0].anomalyFlags).toBeUndefined();
	});

	it("does NOT remove dismissed new-merchant flags (audit trail)", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "OldMerchant",
				createdAt: daysAgo(31),
				firstSeen: daysAgo(31),
			}),
		);
		await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "OLD MERCHANT",
				anomalyFlags: [
					{
						type: "new-merchant",
						reason: "First seen merchant - OldMerchant created 5 days ago",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: true,
						dismissedAt: "2026-01-02T00:00:00.000Z",
					},
				],
			}),
		);

		const result = await cleanExpiredNewMerchantFlags();
		expect(result.cleaned).toBe(0);

		const allTx = await db.transactions.toArray();
		expect(allTx[0].anomalyFlags).toHaveLength(1);
		expect(allTx[0].anomalyFlags?.[0].dismissed).toBe(true);
	});

	it("does NOT affect other anomaly flags on same transaction", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({
				name: "OldMerchant",
				createdAt: daysAgo(31),
				firstSeen: daysAgo(31),
			}),
		);
		await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "OLD MERCHANT",
				anomalyFlags: [
					{
						type: "new-merchant",
						reason: "First seen merchant",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
					},
					{
						type: "high-amount",
						reason: "High amount",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
					},
				],
			}),
		);

		const result = await cleanExpiredNewMerchantFlags();
		expect(result.cleaned).toBe(1);

		const allTx = await db.transactions.toArray();
		expect(allTx[0].anomalyFlags).toHaveLength(1);
		expect(allTx[0].anomalyFlags?.[0].type).toBe("high-amount");
	});
});

describe("DUPLICATE_WINDOW_DAYS", () => {
	it("exports the constant with value 3", () => {
		expect(DUPLICATE_WINDOW_DAYS).toBe(3);
	});
});

describe("detectPotentialDuplicates", () => {
	beforeEach(async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("flags two transactions same merchant, same amount, 1 day apart", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-16"),
			}),
		]);

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(1);
		expect(result.flagged).toBe(2);

		const allTx = await db.transactions.toArray();
		const flagged = allTx.filter((tx) =>
			tx.anomalyFlags?.some(
				(f) => f.type === "potential-duplicate" && !f.dismissed,
			),
		);
		expect(flagged).toHaveLength(2);
	});

	it("does NOT flag two transactions same merchant, same amount, 4 days apart", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-19"),
			}),
		]);

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(0);
		expect(result.flagged).toBe(0);
	});

	it("does NOT flag two transactions same merchant, different amounts", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -5.0,
				date: new Date("2026-01-15"),
			}),
		]);

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(0);
	});

	it("does NOT flag two transactions different merchants, same amount, same date", async () => {
		const merchantA = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		const merchantB = await db.merchants.add(createMerchant({ name: "Costa" }));
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId: merchantA,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId: merchantB,
				rawMerchantString: "COSTA",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
		]);

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(0);
	});

	it("flags unmatched transactions: same raw string, same amount, 2 days apart", async () => {
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId: undefined,
				rawMerchantString: "UNKNOWN SHOP",
				amount: -29.99,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId: undefined,
				rawMerchantString: "UNKNOWN SHOP",
				amount: -29.99,
				date: new Date("2026-01-17"),
			}),
		]);

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(1);
		expect(result.flagged).toBe(2);
	});

	it("does not re-flag already-flagged pair", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		const txAId = await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-16"),
			}),
		);

		// Manually add flags
		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate",
					reason: "Already flagged",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: false,
					linkedTransactionId: txBId,
				},
			],
		});
		await db.transactions.update(txBId, {
			anomalyFlags: [
				{
					type: "potential-duplicate",
					reason: "Already flagged",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: false,
					linkedTransactionId: txAId,
				},
			],
		});

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(0);

		const txA = await db.transactions.get(txAId);
		expect(txA?.anomalyFlags).toHaveLength(1);
	});

	it("does not re-flag dismissed pair", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		const txAId = await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-16"),
			}),
		);

		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate",
					reason: "Dismissed",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: true,
					dismissedAt: "2026-01-02T00:00:00.000Z",
					linkedTransactionId: txBId,
				},
			],
		});
		await db.transactions.update(txBId, {
			anomalyFlags: [
				{
					type: "potential-duplicate",
					reason: "Dismissed",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: true,
					dismissedAt: "2026-01-02T00:00:00.000Z",
					linkedTransactionId: txAId,
				},
			],
		});

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(0);
	});

	it("handles chain A-B-C: B gets two flags", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-16"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-17"),
			}),
		]);

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(3); // A-B, A-C, B-C (all within 3 days)

		const allTx = await db.transactions.toArray();
		// B (middle) should have flags from both A and C
		const txB = allTx.find(
			(tx) => tx.date.getTime() === new Date("2026-01-16").getTime(),
		);
		const dupFlags = txB?.anomalyFlags?.filter(
			(f) => f.type === "potential-duplicate",
		);
		expect(dupFlags.length).toBe(2);
	});

	it("generates correct reason string format", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -29.99,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -29.99,
				date: new Date("2026-01-16"),
			}),
		]);

		await detectPotentialDuplicates();

		const allTx = await db.transactions.toArray();
		const flagged = allTx.find((tx) => tx.anomalyFlags?.length);
		expect(flagged).toBeDefined();
		const reason = flagged?.anomalyFlags?.[0].reason;
		expect(reason).toContain("29,99");
		expect(reason).toContain("Starbucks");
	});

	it("both transactions in pair have linkedTransactionId pointing to each other", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-16"),
			}),
		]);

		await detectPotentialDuplicates();

		const allTx = await db.transactions.toArray();
		const [txA, txB] = allTx;
		const flagA = txA.anomalyFlags?.find(
			(f) => f.type === "potential-duplicate",
		);
		const flagB = txB.anomalyFlags?.find(
			(f) => f.type === "potential-duplicate",
		);
		expect(flagA?.linkedTransactionId).toBe(txB.id);
		expect(flagB?.linkedTransactionId).toBe(txA.id);
	});

	it("excludes refund transactions from detection", async () => {
		const merchantId = await db.merchants.add(
			createMerchant({ name: "Starbucks" }),
		);
		await db.transactions.bulkAdd([
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-15"),
			}),
			createTransaction({
				merchantId,
				rawMerchantString: "STARBUCKS",
				amount: -4.5,
				date: new Date("2026-01-16"),
				isRefund: true,
			}),
		]);

		const result = await detectPotentialDuplicates();
		expect(result.pairs).toBe(0);
	});
});

describe("dismissDuplicateAnomaly", () => {
	beforeEach(async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("dismisses flags on both transactions", async () => {
		const txAId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: 0, // placeholder, updated below
					},
				],
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: txAId,
					},
				],
			}),
		);

		// Fix txA's linkedTransactionId
		const txA = await db.transactions.get(txAId);
		await db.transactions.update(txAId, {
			anomalyFlags: txA?.anomalyFlags?.map((f) => ({
				...f,
				linkedTransactionId: txBId,
			})),
		});

		await dismissDuplicateAnomaly(txAId);

		const updatedA = await db.transactions.get(txAId);
		const updatedB = await db.transactions.get(txBId);
		expect(updatedA?.anomalyFlags?.[0].dismissed).toBe(true);
		expect(updatedB?.anomalyFlags?.[0].dismissed).toBe(true);
	});

	it("undo restores both sides", async () => {
		const txAId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: true,
						dismissedAt: "2026-01-02T00:00:00.000Z",
						linkedTransactionId: 0,
					},
				],
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: true,
						dismissedAt: "2026-01-02T00:00:00.000Z",
						linkedTransactionId: txAId,
					},
				],
			}),
		);

		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate" as const,
					reason: "Test",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: true,
					dismissedAt: "2026-01-02T00:00:00.000Z",
					linkedTransactionId: txBId,
				},
			],
		});

		await undoDismissDuplicateAnomaly(txAId, txBId);

		const updatedA = await db.transactions.get(txAId);
		const updatedB = await db.transactions.get(txBId);
		expect(updatedA?.anomalyFlags?.[0].dismissed).toBe(false);
		expect(updatedB?.anomalyFlags?.[0].dismissed).toBe(false);
	});

	it("does not affect other anomaly types on same transaction", async () => {
		const txAId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Dup",
						detectedAt: "2026-01-01",
						dismissed: false,
						linkedTransactionId: 0,
					},
					{
						type: "high-amount",
						reason: "High",
						detectedAt: "2026-01-01",
						dismissed: false,
					},
				],
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Dup",
						detectedAt: "2026-01-01",
						dismissed: false,
						linkedTransactionId: txAId,
					},
				],
			}),
		);

		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate" as const,
					reason: "Dup",
					detectedAt: "2026-01-01",
					dismissed: false,
					linkedTransactionId: txBId,
				},
				{
					type: "high-amount" as const,
					reason: "High",
					detectedAt: "2026-01-01",
					dismissed: false,
				},
			],
		});

		await dismissDuplicateAnomaly(txAId);

		const updatedA = await db.transactions.get(txAId);
		const dupFlag = updatedA?.anomalyFlags?.find(
			(f) => f.type === "potential-duplicate",
		);
		const highFlag = updatedA?.anomalyFlags?.find(
			(f) => f.type === "high-amount",
		);
		expect(dupFlag?.dismissed).toBe(true);
		expect(highFlag?.dismissed).toBe(false);
	});

	it("chain scenario: dismiss B-A flag does not affect B-C flag", async () => {
		const txAId = await db.transactions.add(createTransaction());
		const txBId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Pair B-A",
						detectedAt: "2026-01-01",
						dismissed: false,
						linkedTransactionId: txAId,
					},
					{
						type: "potential-duplicate",
						reason: "Pair B-C",
						detectedAt: "2026-01-01",
						dismissed: false,
						linkedTransactionId: 0,
					},
				],
			}),
		);
		const txCId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Pair C-B",
						detectedAt: "2026-01-01",
						dismissed: false,
						linkedTransactionId: txBId,
					},
				],
			}),
		);

		// Fix B-C linkedTransactionId
		const txB = await db.transactions.get(txBId);
		const fixedFlags = txB?.anomalyFlags?.map((f) =>
			f.reason === "Pair B-C" ? { ...f, linkedTransactionId: txCId } : f,
		);
		await db.transactions.update(txBId, { anomalyFlags: fixedFlags });

		// Also give A a flag pointing to B
		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate" as const,
					reason: "Pair A-B",
					detectedAt: "2026-01-01",
					dismissed: false,
					linkedTransactionId: txBId,
				},
			],
		});

		// Dismiss B-A (from A's perspective)
		await dismissDuplicateAnomaly(txAId);

		const updatedA = await db.transactions.get(txAId);
		const updatedB = await db.transactions.get(txBId);
		const updatedC = await db.transactions.get(txCId);

		// A's flag should be dismissed
		expect(updatedA?.anomalyFlags?.[0].dismissed).toBe(true);

		// B: flag for A should be dismissed, flag for C should NOT be
		const bFlagA = updatedB?.anomalyFlags?.find(
			(f) => f.linkedTransactionId === txAId,
		);
		const bFlagC = updatedB?.anomalyFlags?.find(
			(f) => f.linkedTransactionId === txCId,
		);
		expect(bFlagA?.dismissed).toBe(true);
		expect(bFlagC?.dismissed).toBe(false);

		// C: flag for B should NOT be affected
		expect(updatedC?.anomalyFlags?.[0].dismissed).toBe(false);
	});
});

describe("confirmDuplicate", () => {
	beforeEach(async () => {
		await db.accounts.add({
			id: 1,
			name: "Test",
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("exclude sets isDuplicateExcluded on transaction", async () => {
		const txAId = await db.transactions.add(
			createTransaction({
				date: new Date("2026-01-15"),
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: 0,
					},
				],
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				date: new Date("2026-01-16"),
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: txAId,
					},
				],
			}),
		);

		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate" as const,
					reason: "Test",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: false,
					linkedTransactionId: txBId,
				},
			],
		});

		await confirmDuplicate(txAId, "exclude");

		const updatedA = await db.transactions.get(txAId);
		expect(updatedA?.isDuplicateExcluded).toBe(true);
		expect(updatedA?.duplicateNote).toContain("Excluded as duplicate");
	});

	it("exclude dismisses flags on BOTH transactions", async () => {
		const txAId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: 0,
					},
				],
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: txAId,
					},
				],
			}),
		);

		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate" as const,
					reason: "Test",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: false,
					linkedTransactionId: txBId,
				},
			],
		});

		await confirmDuplicate(txAId, "exclude");

		const updatedA = await db.transactions.get(txAId);
		const updatedB = await db.transactions.get(txBId);
		expect(updatedA?.anomalyFlags?.[0].dismissed).toBe(true);
		expect(updatedB?.anomalyFlags?.[0].dismissed).toBe(true);
	});

	it("keep dismisses flags but does NOT exclude from spending", async () => {
		const txAId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: 0,
					},
				],
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: false,
						linkedTransactionId: txAId,
					},
				],
			}),
		);

		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate" as const,
					reason: "Test",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: false,
					linkedTransactionId: txBId,
				},
			],
		});

		await confirmDuplicate(txAId, "keep");

		const updatedA = await db.transactions.get(txAId);
		expect(updatedA?.isDuplicateExcluded).toBeUndefined();
		expect(updatedA?.anomalyFlags?.[0].dismissed).toBe(true);
	});

	it("undo restores isDuplicateExcluded and flags on both", async () => {
		const txAId = await db.transactions.add(
			createTransaction({
				isDuplicateExcluded: true,
				duplicateNote: "Excluded as duplicate",
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: true,
						dismissedAt: "2026-01-02T00:00:00.000Z",
						linkedTransactionId: 0,
					},
				],
			}),
		);
		const txBId = await db.transactions.add(
			createTransaction({
				anomalyFlags: [
					{
						type: "potential-duplicate",
						reason: "Test",
						detectedAt: "2026-01-01T00:00:00.000Z",
						dismissed: true,
						dismissedAt: "2026-01-02T00:00:00.000Z",
						linkedTransactionId: txAId,
					},
				],
			}),
		);

		await db.transactions.update(txAId, {
			anomalyFlags: [
				{
					type: "potential-duplicate" as const,
					reason: "Test",
					detectedAt: "2026-01-01T00:00:00.000Z",
					dismissed: true,
					dismissedAt: "2026-01-02T00:00:00.000Z",
					linkedTransactionId: txBId,
				},
			],
		});

		await undoConfirmDuplicate(txAId, txBId);

		const updatedA = await db.transactions.get(txAId);
		const updatedB = await db.transactions.get(txBId);
		expect(updatedA?.isDuplicateExcluded).toBeUndefined();
		expect(updatedA?.duplicateNote).toBeUndefined();
		expect(updatedA?.anomalyFlags?.[0].dismissed).toBe(false);
		expect(updatedB?.anomalyFlags?.[0].dismissed).toBe(false);
	});
});
