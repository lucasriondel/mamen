import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { transactionsApi } from "@/lib/api";
import { db } from "@/lib/db";
import type { Transaction } from "@/types";
import { useUnmatchedCount } from "./useUnmatchedCount";

const makeTransaction = (
	overrides: Partial<Transaction> = {},
): Omit<Transaction, "id"> => ({
	accountId: 1,
	date: new Date(2026, 0, 18),
	amount: -45.99,
	rawMerchantString: "STORE A",
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

beforeEach(async () => {
	await db.transactions.clear();
});

describe("useUnmatchedCount", () => {
	it("returns 0 when no transactions exist", async () => {
		const { result } = renderHook(() => useUnmatchedCount());

		await waitFor(() => {
			expect(result.current.count).toBe(0);
		});
	});

	it("returns correct count for unmatched transactions", async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ rawMerchantString: "STORE A" }),
			makeTransaction({ rawMerchantString: "STORE B" }),
			makeTransaction({ rawMerchantString: "STORE C", merchantId: 1 }),
		]);

		const { result } = renderHook(() => useUnmatchedCount());

		await waitFor(() => {
			expect(result.current.count).toBe(2);
		});
	});

	it("returns 0 when all transactions are matched", async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ merchantId: 1 }),
			makeTransaction({ merchantId: 2 }),
		]);

		const { result } = renderHook(() => useUnmatchedCount());

		await waitFor(() => {
			expect(result.current.count).toBe(0);
		});
	});

	it("updates reactively when transactions change", async () => {
		const { result } = renderHook(() => useUnmatchedCount());

		await waitFor(() => {
			expect(result.current.count).toBe(0);
		});

		// Use API (not direct db) to trigger invalidation
		await transactionsApi.create(makeTransaction() as Record<string, unknown>);

		await waitFor(() => {
			expect(result.current.count).toBe(1);
		});
	});
});
