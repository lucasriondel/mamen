import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { FocusModeProvider } from "@/context/FocusModeContext";
import { db } from "@/lib/db";
import type { Transaction } from "@/types";
import { useCurrentMonthCount } from "./useCurrentMonthCount";

const wrapper = ({ children }: { children: ReactNode }): React.ReactElement =>
	createElement(FocusModeProvider, null, children);

const makeTransaction = (
	overrides: Partial<Transaction> = {},
): Omit<Transaction, "id"> => ({
	accountId: 1,
	date: new Date(),
	amount: -45.99,
	rawMerchantString: "STORE",
	importedAt: new Date(),
	importMonth: "2026-02",
	...overrides,
});

beforeEach(async () => {
	await db.transactions.clear();
});

describe("useCurrentMonthCount", () => {
	it("returns correct count for current month transactions", async () => {
		const now = new Date();
		await db.transactions.bulkAdd([
			makeTransaction({ date: new Date(now.getFullYear(), now.getMonth(), 5) }),
			makeTransaction({
				date: new Date(now.getFullYear(), now.getMonth(), 15),
			}),
			makeTransaction({
				date: new Date(now.getFullYear(), now.getMonth(), 20),
			}),
		]);

		const { result } = renderHook(() => useCurrentMonthCount(), { wrapper });

		await waitFor(() => {
			expect(result.current).toBe(3);
		});
	});

	it("excludes transactions from other months", async () => {
		const now = new Date();
		const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
		const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);

		await db.transactions.bulkAdd([
			makeTransaction({
				date: new Date(now.getFullYear(), now.getMonth(), 10),
			}),
			makeTransaction({ date: lastMonth }),
			makeTransaction({ date: nextMonth }),
		]);

		const { result } = renderHook(() => useCurrentMonthCount(), { wrapper });

		await waitFor(() => {
			expect(result.current).toBe(1);
		});
	});

	it("returns 0 when no transactions exist", async () => {
		const { result } = renderHook(() => useCurrentMonthCount(), { wrapper });

		await waitFor(() => {
			expect(result.current).toBe(0);
		});
	});

	it("returns 0 when no transactions in current month", async () => {
		const now = new Date();
		const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

		await db.transactions.bulkAdd([makeTransaction({ date: lastMonth })]);

		const { result } = renderHook(() => useCurrentMonthCount(), { wrapper });

		await waitFor(() => {
			expect(result.current).toBe(0);
		});
	});
});
