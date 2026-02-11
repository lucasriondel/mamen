import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import type { Transaction } from "@/types";
import { clearSearchIndex } from "../services/searchIndex";
import { useTransactionSearch } from "./useTransactionSearch";

const makeTransaction = (
	overrides: Partial<Transaction> = {},
): Transaction => ({
	accountId: 1,
	date: new Date("2026-01-15"),
	amount: 29.99,
	rawMerchantString: "AMZN*1234XYZ",
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

describe("useTransactionSearch", () => {
	beforeEach(async () => {
		clearSearchIndex();
		await db.transactions.clear();
	});

	it("returns empty results for empty query", async () => {
		await db.transactions.add(makeTransaction());

		const { result } = renderHook(() => useTransactionSearch(""));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.results).toEqual([]);
	});

	it("finds transactions by merchant string", async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ rawMerchantString: "AMAZON PRIME" }),
			makeTransaction({ rawMerchantString: "NETFLIX" }),
		]);

		const { result } = renderHook(() => useTransactionSearch("amazon"));

		await waitFor(() => {
			expect(result.current.results.length).toBeGreaterThanOrEqual(1);
		});

		expect(result.current.results[0].rawMerchantString).toBe("AMAZON PRIME");
	});

	it("search is case-insensitive", async () => {
		await db.transactions.add(
			makeTransaction({ rawMerchantString: "Amazon Prime" }),
		);

		const { result } = renderHook(() => useTransactionSearch("AMAZON"));

		await waitFor(() => {
			expect(result.current.results.length).toBe(1);
		});
	});

	it('fuzzy search finds "amazn" when "amazon" exists', async () => {
		await db.transactions.add(
			makeTransaction({ rawMerchantString: "AMAZON PRIME" }),
		);

		const { result } = renderHook(() => useTransactionSearch("amazn"));

		await waitFor(() => {
			expect(result.current.results.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("finds transactions by amount", async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ rawMerchantString: "STORE A", amount: 29.99 }),
			makeTransaction({ rawMerchantString: "STORE B", amount: 14.99 }),
		]);

		const { result } = renderHook(() => useTransactionSearch("29.99"));

		await waitFor(() => {
			expect(result.current.results.length).toBeGreaterThanOrEqual(1);
		});

		expect(result.current.results[0].amount).toBe(29.99);
	});

	it("limits results to max count", async () => {
		const transactions = Array.from({ length: 20 }, (_, i) =>
			makeTransaction({ rawMerchantString: `AMAZON ORDER ${i}` }),
		);
		await db.transactions.bulkAdd(transactions);

		const { result } = renderHook(() => useTransactionSearch("amazon"));

		await waitFor(() => {
			expect(result.current.results.length).toBeGreaterThan(0);
		});

		expect(result.current.results.length).toBeLessThanOrEqual(10);
	});

	it("returns isLoading true before data loads", () => {
		// Use a mock to simulate slow loading
		const originalToArray = db.transactions.toArray;
		vi.spyOn(db.transactions, "toArray").mockImplementation(
			() => new Promise(() => {}),
		);

		const { result } = renderHook(() => useTransactionSearch("test"));
		expect(result.current.isLoading).toBe(true);

		// Restore
		db.transactions.toArray = originalToArray;
	});
});
