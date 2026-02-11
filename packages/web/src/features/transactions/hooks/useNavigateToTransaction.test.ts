import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db";
import { useNavigateToTransaction } from "./useNavigateToTransaction";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

vi.mock("sonner", () => ({
	toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

const { toast } = await import("sonner");

beforeEach(async () => {
	await db.transactions.clear();
	await db.accounts.clear();
	await db.accounts.add({
		id: 1,
		name: "Test",
		type: "checking",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	vi.clearAllMocks();
});

describe("useNavigateToTransaction", () => {
	it("navigates to transaction with highlight param", async () => {
		const txId = await db.transactions.add({
			accountId: 1,
			date: new Date(2026, 0, 15),
			amount: -29.99,
			rawMerchantString: "AMAZON",
			importedAt: new Date(),
			importMonth: "2026-01",
		});

		const { result } = renderHook(() => useNavigateToTransaction());

		await act(async () => {
			await result.current.navigateToTransaction(txId);
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/transactions",
			search: { highlight: txId },
		});
	});

	it("shows error toast when transaction not found", async () => {
		const { result } = renderHook(() => useNavigateToTransaction());

		await act(async () => {
			await result.current.navigateToTransaction(99999);
		});

		expect(toast.error).toHaveBeenCalledWith("Linked transaction not found");
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
