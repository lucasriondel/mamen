import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import {
	deleteTransactions,
	undoDeleteTransactions,
} from "./deleteTransactions";

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
	]);
};

describe("deleteTransactions", () => {
	beforeEach(async () => {
		await db.transactions.clear();
	});

	it("deletes multiple transactions and returns previous states", async () => {
		await seedTransactions();
		const txs = await db.transactions.toArray();
		const ids = txs.map((t) => t.id!);

		const result = await deleteTransactions(ids);

		expect(result.deletedCount).toBe(3);
		expect(result.previousStates).toHaveLength(3);

		const remaining = await db.transactions.count();
		expect(remaining).toBe(0);
	});

	it("preserves full transaction data in previousStates", async () => {
		await seedTransactions();
		const txs = await db.transactions.toArray();
		const ids = [txs[0].id!];

		const result = await deleteTransactions(ids);

		expect(result.previousStates[0].rawMerchantString).toBe("STORE A");
		expect(result.previousStates[0].amount).toBe(-15);
		expect(result.previousStates[0].accountId).toBe(1);
	});

	it("handles empty array gracefully", async () => {
		const result = await deleteTransactions([]);

		expect(result.deletedCount).toBe(0);
		expect(result.previousStates).toHaveLength(0);
	});

	it("skips non-existent ids without error", async () => {
		await seedTransactions();
		const txs = await db.transactions.toArray();

		const result = await deleteTransactions([txs[0].id!, 99999]);

		expect(result.deletedCount).toBe(1);
		expect(result.previousStates).toHaveLength(1);

		const remaining = await db.transactions.count();
		expect(remaining).toBe(2);
	});
});

describe("undoDeleteTransactions", () => {
	beforeEach(async () => {
		await db.transactions.clear();
	});

	it("restores deleted transactions", async () => {
		await seedTransactions();
		const txs = await db.transactions.toArray();
		const ids = txs.map((t) => t.id!);

		const result = await deleteTransactions(ids);

		expect(await db.transactions.count()).toBe(0);

		await undoDeleteTransactions(result.previousStates);

		const restored = await db.transactions.toArray();
		expect(restored).toHaveLength(3);

		for (const tx of restored) {
			const original = txs.find((t) => t.id === tx.id);
			expect(tx.rawMerchantString).toBe(original?.rawMerchantString);
			expect(tx.amount).toBe(original?.amount);
		}
	});
});
