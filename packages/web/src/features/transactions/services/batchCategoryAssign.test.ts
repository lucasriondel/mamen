import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import {
	batchCategoryAssign,
	undoBatchCategoryAssign,
} from "./batchCategoryAssign";

const seedTransactions = async () => {
	return db.transactions.bulkAdd([
		{
			accountId: 1,
			date: new Date("2025-01-10"),
			amount: -15,
			rawMerchantString: "STORE A",
			importedAt: new Date(),
			importMonth: "2025-01",
		},
		{
			accountId: 1,
			date: new Date("2025-01-11"),
			amount: -20,
			rawMerchantString: "STORE B",
			importedAt: new Date(),
			importMonth: "2025-01",
		},
		{
			accountId: 1,
			date: new Date("2025-01-12"),
			amount: -10,
			rawMerchantString: "STORE C",
			importedAt: new Date(),
			importMonth: "2025-01",
		},
		{
			accountId: 1,
			date: new Date("2025-01-13"),
			amount: -50,
			rawMerchantString: "STORE D",
			importedAt: new Date(),
			importMonth: "2025-01",
		},
		{
			accountId: 1,
			date: new Date("2025-01-14"),
			amount: -25,
			rawMerchantString: "STORE E",
			importedAt: new Date(),
			importMonth: "2025-01",
		},
	]);
};

const seedCategories = async () => {
	const parentId = (await db.categories.add({
		name: "Dining",
		slug: "dining",
		color: "#ef4444",
		icon: "utensils",
		sortOrder: 0,
	})) as number;

	const subId = (await db.categories.add({
		name: "Restaurants",
		slug: "restaurants",
		color: "#f97316",
		icon: "utensils",
		sortOrder: 0,
		parentId,
	})) as number;

	const otherId = (await db.categories.add({
		name: "Transport",
		slug: "transport",
		color: "#3b82f6",
		icon: "car",
		sortOrder: 1,
	})) as number;

	return { parentId, subId, otherId };
};

describe("batchCategoryAssign", () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.categories.clear();
		await db.merchants.clear();
	});

	it("assigns category to multiple uncategorized transactions", async () => {
		await seedTransactions();
		const { parentId } = await seedCategories();
		const txs = await db.transactions.toArray();
		const ids = txs.slice(0, 5).map((t) => t.id!);

		const result = await batchCategoryAssign({
			transactionIds: ids,
			categoryId: parentId,
		});

		expect(result.affectedCount).toBe(5);
		expect(result.changedCount).toBe(5);
		expect(result.previousStates).toHaveLength(5);

		const updated = await db.transactions.bulkGet(ids);
		for (const tx of updated) {
			expect(tx?.categoryId).toBe(parentId);
			expect(tx?.manualCategory).toBe(true);
			expect(tx?.merchantId).toBeUndefined();
		}
	});

	it("assigns category with subcategory", async () => {
		await seedTransactions();
		const { parentId, subId } = await seedCategories();
		const txs = await db.transactions.toArray();
		const ids = txs.slice(0, 2).map((t) => t.id!);

		const result = await batchCategoryAssign({
			transactionIds: ids,
			categoryId: parentId,
			subcategoryId: subId,
		});

		expect(result.affectedCount).toBe(2);

		const updated = await db.transactions.bulkGet(ids);
		for (const tx of updated) {
			expect(tx?.categoryId).toBe(parentId);
			expect(tx?.subcategoryId).toBe(subId);
			expect(tx?.manualCategory).toBe(true);
		}
	});

	it("updates transactions with existing categories", async () => {
		await seedTransactions();
		const { parentId, otherId } = await seedCategories();
		const txs = await db.transactions.toArray();
		const ids = txs.slice(0, 3).map((t) => t.id!);

		// Pre-assign a category
		await db.transactions.update(ids[0], {
			categoryId: otherId,
			manualCategory: true,
		});

		const result = await batchCategoryAssign({
			transactionIds: ids,
			categoryId: parentId,
		});

		expect(result.affectedCount).toBe(3);
		expect(result.changedCount).toBe(3);

		// First tx should have previous state with otherId
		const prev = result.previousStates.find((s) => s.id === ids[0]);
		expect(prev?.categoryId).toBe(otherId);
	});

	it("overrides merchant-assigned categories and clears merchantId", async () => {
		await seedTransactions();
		const { parentId } = await seedCategories();
		const txs = await db.transactions.toArray();
		const ids = txs.slice(0, 2).map((t) => t.id!);

		// Pre-assign merchant
		const merchantId = (await db.merchants.add({
			name: "TestMerchant",
			defaultCategoryId: parentId,
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;
		await db.transactions.update(ids[0], { merchantId, categoryId: parentId });

		const result = await batchCategoryAssign({
			transactionIds: ids,
			categoryId: parentId,
		});

		expect(result.affectedCount).toBe(2);
		// id[0] had merchant, so it changed (merchantId cleared)
		const prev0 = result.previousStates.find((s) => s.id === ids[0]);
		expect(prev0?.merchantId).toBe(merchantId);

		const updated = await db.transactions.get(ids[0]);
		expect(updated?.merchantId).toBeUndefined();
		expect(updated?.manualCategory).toBe(true);
	});

	it("correctly counts changedCount for same-category transactions", async () => {
		await seedTransactions();
		const { parentId } = await seedCategories();
		const txs = await db.transactions.toArray();
		const ids = txs.slice(0, 3).map((t) => t.id!);

		// Pre-assign same category with manualCategory=true to one tx
		await db.transactions.update(ids[0], {
			categoryId: parentId,
			manualCategory: true,
		});

		const result = await batchCategoryAssign({
			transactionIds: ids,
			categoryId: parentId,
		});

		// ids[0] already had same category + manualCategory + no merchant → no change
		expect(result.changedCount).toBe(2);
	});

	it("sets manualCategory to true for all assigned transactions", async () => {
		await seedTransactions();
		const { parentId } = await seedCategories();
		const txs = await db.transactions.toArray();
		const ids = txs.map((t) => t.id!);

		await batchCategoryAssign({
			transactionIds: ids,
			categoryId: parentId,
		});

		const updated = await db.transactions.bulkGet(ids);
		for (const tx of updated) {
			expect(tx?.manualCategory).toBe(true);
		}
	});

	it("handles empty transaction list gracefully", async () => {
		const { parentId } = await seedCategories();

		const result = await batchCategoryAssign({
			transactionIds: [],
			categoryId: parentId,
		});

		expect(result.affectedCount).toBe(0);
		expect(result.changedCount).toBe(0);
		expect(result.previousStates).toHaveLength(0);
	});
});

describe("undoBatchCategoryAssign", () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.categories.clear();
		await db.merchants.clear();
	});

	it("restores all transactions to previous state including merchantId", async () => {
		await seedTransactions();
		const { parentId, otherId } = await seedCategories();
		const txs = await db.transactions.toArray();
		const ids = txs.slice(0, 3).map((t) => t.id!);

		// Set up varied previous states
		const merchantId = (await db.merchants.add({
			name: "TestMerchant",
			defaultCategoryId: otherId,
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		await db.transactions.update(ids[0], {
			categoryId: otherId,
			merchantId,
			manualCategory: false,
		});
		await db.transactions.update(ids[1], {
			categoryId: parentId,
			manualCategory: true,
		});

		const result = await batchCategoryAssign({
			transactionIds: ids,
			categoryId: parentId,
		});

		// Undo
		await undoBatchCategoryAssign(result.previousStates);

		// Verify restoration
		const tx0 = await db.transactions.get(ids[0]);
		expect(tx0?.categoryId).toBe(otherId);
		expect(tx0?.merchantId).toBe(merchantId);
		expect(tx0?.manualCategory).toBe(false);

		const tx1 = await db.transactions.get(ids[1]);
		expect(tx1?.categoryId).toBe(parentId);
		expect(tx1?.manualCategory).toBe(true);

		const tx2 = await db.transactions.get(ids[2]);
		expect(tx2?.categoryId).toBeUndefined();
		expect(tx2?.merchantId).toBeUndefined();
	});
});
