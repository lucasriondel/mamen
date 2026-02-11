import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import { useQuickCategoryAssign } from "./useQuickCategoryAssign";

vi.mock("sonner", () => ({
	toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

const { toast } = await import("sonner");

const makeTransaction = (overrides = {}) => ({
	accountId: 1,
	date: new Date(2026, 0, 15),
	amount: -42.99,
	rawMerchantString: "STORE PURCHASE",
	importedAt: new Date(),
	importMonth: "2026-01",
	...overrides,
});

const seedCategory = async () => {
	await db.categories.clear();
	const catId = (await db.categories.add({
		name: "Shopping",
		slug: "shopping",
		color: "#3b82f6",
		icon: "cart",
		parentId: null,
		sortOrder: 1,
		createdAt: new Date(),
	})) as number;

	const subId = (await db.categories.add({
		name: "Online",
		slug: "shopping-online",
		color: "#3b82f6",
		icon: "globe",
		parentId: catId,
		sortOrder: 1,
		createdAt: new Date(),
	})) as number;

	return { catId, subId };
};

describe("useQuickCategoryAssign", () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.categories.clear();
		vi.clearAllMocks();
	});

	it("assigns category to transaction in database", async () => {
		const { catId } = await seedCategory();
		const txId = (await db.transactions.add(makeTransaction())) as number;

		const { result } = renderHook(() => useQuickCategoryAssign());

		await act(async () => {
			await result.current.assignCategory(txId, catId);
		});

		const updated = await db.transactions.get(txId);
		expect(updated?.categoryId).toBe(catId);
		expect(updated?.manualCategory).toBe(true);
		expect(updated?.merchantId).toBeUndefined();
	});

	it("assigns category with subcategory", async () => {
		const { catId, subId } = await seedCategory();
		const txId = (await db.transactions.add(makeTransaction())) as number;

		const { result } = renderHook(() => useQuickCategoryAssign());

		await act(async () => {
			await result.current.assignCategory(txId, catId, subId);
		});

		const updated = await db.transactions.get(txId);
		expect(updated?.categoryId).toBe(catId);
		expect(updated?.subcategoryId).toBe(subId);
	});

	it("shows success toast", async () => {
		const { catId } = await seedCategory();
		const txId = (await db.transactions.add(makeTransaction())) as number;

		const { result } = renderHook(() => useQuickCategoryAssign());

		await act(async () => {
			await result.current.assignCategory(txId, catId);
		});

		expect(toast).toHaveBeenCalledWith(
			expect.stringContaining("Categorized as"),
			expect.objectContaining({
				action: expect.objectContaining({ label: "Undo" }),
				duration: 10000,
			}),
		);
	});

	it("shows error toast on failure", async () => {
		const { result } = renderHook(() => useQuickCategoryAssign());

		await act(async () => {
			await result.current.assignCategory(99999, 1);
		});

		expect(toast.error).toHaveBeenCalledWith(
			"Failed to assign category",
			expect.any(Object),
		);
		expect(result.current.error).toBeTruthy();
	});

	it("tracks isAssigning state", async () => {
		const { catId } = await seedCategory();
		const txId = (await db.transactions.add(makeTransaction())) as number;

		const { result } = renderHook(() => useQuickCategoryAssign());

		expect(result.current.isAssigning).toBe(false);

		await act(async () => {
			await result.current.assignCategory(txId, catId);
		});

		expect(result.current.isAssigning).toBe(false);
	});
});
