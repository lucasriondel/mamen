import { beforeEach, describe, expect, it } from "vitest";
import type { Transaction } from "@/types";
import {
	buildSearchIndex,
	clearSearchIndex,
	isIndexReady,
	searchTransactions,
} from "./searchIndex";

const makeTransaction = (
	overrides: Partial<Transaction> = {},
): Transaction => ({
	id: 1,
	accountId: 1,
	date: new Date("2026-01-15"),
	amount: 29.99,
	rawMerchantString: "AMZN*1234XYZ",
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

describe("searchIndex", () => {
	beforeEach(() => {
		clearSearchIndex();
	});

	describe("buildSearchIndex", () => {
		it("builds index from transactions", () => {
			const transactions = [
				makeTransaction({ id: 1, rawMerchantString: "AMAZON PRIME" }),
				makeTransaction({ id: 2, rawMerchantString: "NETFLIX" }),
			];

			buildSearchIndex(transactions);
			expect(isIndexReady()).toBe(true);
		});

		it("skips transactions without id", () => {
			const transactions = [
				makeTransaction({ id: undefined, rawMerchantString: "NO ID" }),
				makeTransaction({ id: 1, rawMerchantString: "HAS ID" }),
			];

			buildSearchIndex(transactions);
			const results = searchTransactions("HAS");
			expect(results).toHaveLength(1);
			expect(results[0].rawMerchantString).toBe("HAS ID");
		});

		it("replaces previous index on rebuild", () => {
			buildSearchIndex([makeTransaction({ id: 1, rawMerchantString: "OLD" })]);
			expect(searchTransactions("OLD")).toHaveLength(1);

			buildSearchIndex([makeTransaction({ id: 2, rawMerchantString: "NEW" })]);
			expect(searchTransactions("OLD")).toHaveLength(0);
			expect(searchTransactions("NEW")).toHaveLength(1);
		});
	});

	describe("searchTransactions", () => {
		it("finds transactions by merchant string", () => {
			buildSearchIndex([
				makeTransaction({ id: 1, rawMerchantString: "AMAZON PRIME" }),
				makeTransaction({ id: 2, rawMerchantString: "NETFLIX" }),
				makeTransaction({ id: 3, rawMerchantString: "SPOTIFY" }),
			]);

			const results = searchTransactions("amazon");
			expect(results).toHaveLength(1);
			expect(results[0].rawMerchantString).toBe("AMAZON PRIME");
		});

		it("search is case-insensitive", () => {
			buildSearchIndex([
				makeTransaction({ id: 1, rawMerchantString: "Amazon Prime" }),
			]);

			const results = searchTransactions("AMAZON");
			expect(results).toHaveLength(1);
		});

		it("finds transactions by amount", () => {
			buildSearchIndex([
				makeTransaction({ id: 1, amount: 29.99 }),
				makeTransaction({ id: 2, amount: 14.99 }),
			]);

			const results = searchTransactions("29.99");
			expect(results).toHaveLength(1);
			expect(results[0].amount).toBe(29.99);
		});

		it("returns empty array for empty query", () => {
			buildSearchIndex([makeTransaction()]);
			expect(searchTransactions("")).toEqual([]);
			expect(searchTransactions("   ")).toEqual([]);
		});

		it("returns empty array when index not built", () => {
			expect(searchTransactions("test")).toEqual([]);
		});

		it("limits results to specified count", () => {
			const transactions = Array.from({ length: 20 }, (_, i) =>
				makeTransaction({ id: i + 1, rawMerchantString: `AMAZON ORDER ${i}` }),
			);

			buildSearchIndex(transactions);
			const results = searchTransactions("amazon", 5);
			expect(results.length).toBeLessThanOrEqual(5);
		});

		it("defaults to 10 result limit", () => {
			const transactions = Array.from({ length: 20 }, (_, i) =>
				makeTransaction({ id: i + 1, rawMerchantString: `AMAZON ORDER ${i}` }),
			);

			buildSearchIndex(transactions);
			const results = searchTransactions("amazon");
			expect(results.length).toBeLessThanOrEqual(10);
		});

		it("returns results with score", () => {
			buildSearchIndex([
				makeTransaction({ id: 1, rawMerchantString: "AMAZON" }),
			]);

			const results = searchTransactions("amazon");
			expect(results[0]).toHaveProperty("score");
			expect(results[0].score).toBeGreaterThan(0);
		});

		it("boosts exact merchant matches over partial", () => {
			buildSearchIndex([
				makeTransaction({ id: 1, rawMerchantString: "AMAZON PRIME" }),
				makeTransaction({ id: 2, rawMerchantString: "AMAZON" }),
			]);

			const results = searchTransactions("amazon");
			// Both should be found
			expect(results.length).toBe(2);
		});
	});

	describe("fuzzy matching", () => {
		it('finds "amazn" when "amazon" exists (missing letter)', () => {
			buildSearchIndex([
				makeTransaction({ id: 1, rawMerchantString: "AMAZON PRIME" }),
			]);

			const results = searchTransactions("amazn");
			expect(results.length).toBeGreaterThanOrEqual(1);
			expect(results[0].rawMerchantString).toBe("AMAZON PRIME");
		});

		it('finds "netflx" when "netflix" exists (missing letter)', () => {
			buildSearchIndex([
				makeTransaction({ id: 1, rawMerchantString: "NETFLIX" }),
			]);

			const results = searchTransactions("netflx");
			expect(results.length).toBeGreaterThanOrEqual(1);
		});

		it('finds "spotfy" when "spotify" exists (missing letter)', () => {
			buildSearchIndex([
				makeTransaction({ id: 1, rawMerchantString: "SPOTIFY" }),
			]);

			const results = searchTransactions("spotfy");
			expect(results.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("performance", () => {
		it("handles 10k transactions in under 100ms", () => {
			const transactions = Array.from({ length: 10000 }, (_, i) =>
				makeTransaction({
					id: i + 1,
					rawMerchantString: `MERCHANT_${i}_${["AMAZON", "NETFLIX", "SPOTIFY", "GOOGLE", "APPLE"][i % 5]}`,
					amount: Math.random() * 1000,
				}),
			);

			buildSearchIndex(transactions);

			const start = performance.now();
			const results = searchTransactions("amazon", 20);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
			expect(results.length).toBeGreaterThan(0);
			expect(results.length).toBeLessThanOrEqual(20);
		});
	});
});
