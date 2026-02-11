import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Category, Transaction } from "@/types";
import { useNetSpending } from "./useNetSpending";

const makeTransaction = (
	overrides: Partial<Transaction> = {},
): Omit<Transaction, "id"> => ({
	accountId: 1,
	date: new Date(2026, 0, 15),
	amount: -50,
	rawMerchantString: "STORE",
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

const makeCategory = (
	overrides: Partial<Category> = {},
): Omit<Category, "id"> => ({
	name: "Shopping",
	slug: "shopping",
	color: "#3B82F6",
	icon: "ShoppingCart",
	parentId: null,
	sortOrder: 0,
	createdAt: new Date(),
	...overrides,
});

beforeEach(async () => {
	await db.transactions.clear();
	await db.categories.clear();
});

describe("useNetSpending", () => {
	it("returns full refund pair as EUR0 net for category", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		const purchaseId = (await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		)) as number;

		const refundId = (await db.transactions.add(
			makeTransaction({
				amount: 100,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: purchaseId,
			}) as Transaction,
		)) as number;

		// Link purchase back to refund
		await db.transactions.update(purchaseId, { linkedRefundId: refundId });

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			const cat = result.current!.categories.find(
				(c) => c.categoryId === catId,
			);
			expect(cat).toBeDefined();
			expect(cat!.grossSpending).toBe(100);
			expect(cat!.linkedRefunds).toBe(100);
			expect(cat!.netSpending).toBe(0);
			expect(result.current!.totalNet).toBe(0);
		});
	});

	it("returns partial refund as EUR70 net", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		const purchaseId = (await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		)) as number;

		const refundId = (await db.transactions.add(
			makeTransaction({
				amount: 30,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: purchaseId,
			}) as Transaction,
		)) as number;

		await db.transactions.update(purchaseId, { linkedRefundId: refundId });

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			const cat = result.current!.categories.find(
				(c) => c.categoryId === catId,
			);
			expect(cat!.grossSpending).toBe(100);
			expect(cat!.linkedRefunds).toBe(30);
			expect(cat!.netSpending).toBe(70);
			expect(result.current!.totalNet).toBe(70);
		});
	});

	it("shows orphan refunds as separate entry not subtracted from categories", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		await db.transactions.add(
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
		);
		await db.transactions.add(
			makeTransaction({ amount: 50, isRefund: true }) as Transaction,
		);

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			expect(result.current!.orphanRefunds).toBe(50);
			const cat = result.current!.categories.find(
				(c) => c.categoryId === catId,
			);
			expect(cat!.netSpending).toBe(100); // not reduced by orphan refund
			expect(result.current!.totalNet).toBe(100);
		});
	});

	it("calculates multiple categories with refunds independently", async () => {
		const catA = (await db.categories.add(
			makeCategory({ name: "Shopping", slug: "shopping" }) as Category,
		)) as number;
		const catB = (await db.categories.add(
			makeCategory({
				name: "Dining",
				slug: "dining",
				color: "#F97316",
				sortOrder: 1,
			}) as Category,
		)) as number;

		// Shopping: -200 purchase, +50 linked refund => net 150
		const purchaseA = (await db.transactions.add(
			makeTransaction({ amount: -200, categoryId: catA }) as Transaction,
		)) as number;
		const refundA = (await db.transactions.add(
			makeTransaction({
				amount: 50,
				categoryId: catA,
				isRefund: true,
				linkedRefundId: purchaseA,
			}) as Transaction,
		)) as number;
		await db.transactions.update(purchaseA, { linkedRefundId: refundA });

		// Dining: -80, no refund => net 80
		await db.transactions.add(
			makeTransaction({ amount: -80, categoryId: catB }) as Transaction,
		);

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			const shopping = result.current!.categories.find(
				(c) => c.categoryId === catA,
			);
			const dining = result.current!.categories.find(
				(c) => c.categoryId === catB,
			);
			expect(shopping!.netSpending).toBe(150);
			expect(dining!.netSpending).toBe(80);
			expect(result.current!.totalGross).toBe(280);
			expect(result.current!.totalLinkedRefunds).toBe(50);
			expect(result.current!.totalNet).toBe(230);
		});
	});

	it("calculates gross totals correctly", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		await db.transactions.bulkAdd([
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
			makeTransaction({ amount: -50, categoryId: catId }) as Transaction,
		]);

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			expect(result.current!.totalGross).toBe(150);
			expect(result.current!.totalNet).toBe(150); // no refunds
		});
	});

	it("returns all zeros for empty time period", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;
		await db.transactions.add(
			makeTransaction({
				amount: -100,
				categoryId: catId,
				date: new Date(2026, 0, 15),
			}) as Transaction,
		);

		// Date range with no transactions
		const dateRange = {
			startDate: new Date(2026, 5, 1),
			endDate: new Date(2026, 5, 30),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			expect(result.current!.totalGross).toBe(0);
			expect(result.current!.totalNet).toBe(0);
			expect(result.current!.totalLinkedRefunds).toBe(0);
			expect(result.current!.orphanRefunds).toBe(0);
			expect(result.current!.categories).toHaveLength(0);
		});
	});

	it("excludes transactions outside time period", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		await db.transactions.bulkAdd([
			makeTransaction({
				amount: -100,
				categoryId: catId,
				date: new Date(2026, 0, 10),
			}) as Transaction,
			makeTransaction({
				amount: -200,
				categoryId: catId,
				date: new Date(2026, 1, 5),
			}) as Transaction,
		]);

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			expect(result.current!.totalGross).toBe(100); // only Jan transaction
		});
	});

	it("counts linked refund with purchase outside time period in refund period", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		// Purchase in December (outside range)
		const purchaseId = (await db.transactions.add(
			makeTransaction({
				amount: -100,
				categoryId: catId,
				date: new Date(2025, 11, 15),
			}) as Transaction,
		)) as number;

		// Refund in January (inside range)
		const refundId = (await db.transactions.add(
			makeTransaction({
				amount: 100,
				categoryId: catId,
				isRefund: true,
				linkedRefundId: purchaseId,
				date: new Date(2026, 0, 10),
			}) as Transaction,
		)) as number;

		await db.transactions.update(purchaseId, { linkedRefundId: refundId });

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			// No purchase in this period, but linked refund is here
			// The refund should still count against the category
			const cat = result.current!.categories.find(
				(c) => c.categoryId === catId,
			);
			expect(cat).toBeDefined();
			expect(cat!.grossSpending).toBe(0); // no expenses in this period
			expect(cat!.linkedRefunds).toBe(100);
			expect(cat!.netSpending).toBe(-100); // net goes negative (credit)
			expect(result.current!.totalLinkedRefunds).toBe(100);
		});
	});

	it("excludes income transactions (positive, not refunds) from spending", async () => {
		const catId = (await db.categories.add(
			makeCategory() as Category,
		)) as number;

		await db.transactions.bulkAdd([
			makeTransaction({ amount: -100, categoryId: catId }) as Transaction,
			makeTransaction({ amount: 1500, categoryId: catId }) as Transaction, // income, not refund
		]);

		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));

		await waitFor(() => {
			expect(result.current).not.toBeNull();
			expect(result.current!.totalGross).toBe(100); // only the expense
			expect(result.current!.orphanRefunds).toBe(0);
		});
	});

	it("returns null while loading", () => {
		const dateRange = {
			startDate: new Date(2026, 0, 1),
			endDate: new Date(2026, 0, 31),
		};
		const { result } = renderHook(() => useNetSpending(dateRange));
		// Initial state before useLiveQuery resolves
		expect(result.current).toBeNull();
	});
});
