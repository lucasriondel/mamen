import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import {
	assignManualCategory,
	undoManualCategoryAssignment,
} from "./assignManualCategory";

const makeTransaction = (overrides = {}) => ({
	accountId: 1,
	date: new Date(2026, 0, 15),
	amount: -42.99,
	rawMerchantString: "STORE PURCHASE",
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

describe("assignManualCategory", () => {
	beforeEach(async () => {
		await db.transactions.clear();
	});

	it("assigns category and sets manualCategory flag", async () => {
		const txId = (await db.transactions.add(makeTransaction())) as number;

		await assignManualCategory(txId, 10, 20);

		const updated = await db.transactions.get(txId);
		expect(updated?.categoryId).toBe(10);
		expect(updated?.subcategoryId).toBe(20);
		expect(updated?.manualCategory).toBe(true);
		expect(updated?.merchantId).toBeUndefined();
	});

	it("clears merchantId when assigning manual category", async () => {
		const txId = (await db.transactions.add(
			makeTransaction({ merchantId: 5, categoryId: 3 }),
		)) as number;

		await assignManualCategory(txId, 10);

		const updated = await db.transactions.get(txId);
		expect(updated?.merchantId).toBeUndefined();
		expect(updated?.categoryId).toBe(10);
		expect(updated?.manualCategory).toBe(true);
	});

	it("returns previous state for undo", async () => {
		const txId = (await db.transactions.add(
			makeTransaction({
				merchantId: 5,
				categoryId: 3,
				subcategoryId: 7,
				manualCategory: false,
			}),
		)) as number;

		const result = await assignManualCategory(txId, 10, 20);

		expect(result.previousMerchantId).toBe(5);
		expect(result.previousCategoryId).toBe(3);
		expect(result.previousSubcategoryId).toBe(7);
		expect(result.previousManualCategory).toBe(false);
	});

	it("assigns without subcategoryId", async () => {
		const txId = (await db.transactions.add(makeTransaction())) as number;

		await assignManualCategory(txId, 10);

		const updated = await db.transactions.get(txId);
		expect(updated?.categoryId).toBe(10);
		expect(updated?.subcategoryId).toBeUndefined();
	});

	it("throws when transaction not found", async () => {
		await expect(assignManualCategory(99999, 10)).rejects.toThrow(
			"Transaction not found: 99999",
		);
	});
});

describe("undoManualCategoryAssignment", () => {
	beforeEach(async () => {
		await db.transactions.clear();
	});

	it("restores previous state", async () => {
		const txId = (await db.transactions.add(
			makeTransaction({
				merchantId: 5,
				categoryId: 3,
				subcategoryId: 7,
				manualCategory: false,
			}),
		)) as number;

		const previousState = await assignManualCategory(txId, 10, 20);
		await undoManualCategoryAssignment(txId, previousState);

		const restored = await db.transactions.get(txId);
		expect(restored?.merchantId).toBe(5);
		expect(restored?.categoryId).toBe(3);
		expect(restored?.subcategoryId).toBe(7);
		expect(restored?.manualCategory).toBe(false);
	});

	it("restores to unmatched state", async () => {
		const txId = (await db.transactions.add(makeTransaction())) as number;

		const previousState = await assignManualCategory(txId, 10);
		await undoManualCategoryAssignment(txId, previousState);

		const restored = await db.transactions.get(txId);
		expect(restored?.merchantId).toBeUndefined();
		expect(restored?.categoryId).toBeUndefined();
		expect(restored?.manualCategory).toBeUndefined();
	});
});
