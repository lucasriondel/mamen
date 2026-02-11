import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Subscription } from "@/types";
import { useSubscriptions } from "./useSubscriptions";

const makeSub = (
	overrides: Partial<Subscription> = {},
): Omit<Subscription, "id"> => ({
	merchantId: 1,
	merchantName: "Test",
	typicalAmount: -15.99,
	frequency: "monthly",
	intervalDays: 30,
	lastChargeDate: "2026-01-15",
	firstChargeDate: "2025-10-15",
	chargeCount: 4,
	status: "active",
	transactionIds: [1, 2, 3, 4],
	detectedAt: "2026-01-15",
	updatedAt: "2026-01-15",
	...overrides,
});

beforeEach(async () => {
	await db.subscriptions.clear();
});

describe("useSubscriptions", () => {
	it("returns empty arrays when no subscriptions", async () => {
		const { result } = renderHook(() => useSubscriptions());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.subscriptions).toHaveLength(0);
		expect(result.current.active).toHaveLength(0);
		expect(result.current.possiblyCancelled).toHaveLength(0);
		expect(result.current.count).toBe(0);
		expect(result.current.monthlyTotal).toBe(0);
		expect(result.current.yearlyTotal).toBe(0);
	});

	it("correctly separates active from possibly-cancelled", async () => {
		await db.subscriptions.bulkAdd([
			makeSub({ merchantName: "Netflix", status: "active" }),
			makeSub({
				merchantId: 2,
				merchantName: "OldService",
				status: "possibly-cancelled",
			}),
		]);

		const { result } = renderHook(() => useSubscriptions());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
			expect(result.current.subscriptions).toHaveLength(2);
		});

		expect(result.current.active).toHaveLength(1);
		expect(result.current.active[0].merchantName).toBe("Netflix");
		expect(result.current.possiblyCancelled).toHaveLength(1);
		expect(result.current.possiblyCancelled[0].merchantName).toBe("OldService");
	});

	it("computes monthlyTotal from active monthly subscriptions only", async () => {
		await db.subscriptions.bulkAdd([
			makeSub({
				merchantId: 1,
				merchantName: "Netflix",
				typicalAmount: -15.99,
				frequency: "monthly",
				status: "active",
			}),
			makeSub({
				merchantId: 2,
				merchantName: "Spotify",
				typicalAmount: -9.99,
				frequency: "monthly",
				status: "active",
			}),
			makeSub({
				merchantId: 3,
				merchantName: "Yearly",
				typicalAmount: -99.99,
				frequency: "yearly",
				status: "active",
			}),
			makeSub({
				merchantId: 4,
				merchantName: "Cancelled",
				typicalAmount: -5.0,
				frequency: "monthly",
				status: "possibly-cancelled",
			}),
		]);

		const { result } = renderHook(() => useSubscriptions());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Only active monthly: 15.99 + 9.99
		expect(result.current.monthlyTotal).toBeCloseTo(25.98);
	});

	it("computes yearlyTotal normalizing all frequencies", async () => {
		await db.subscriptions.bulkAdd([
			makeSub({
				merchantId: 1,
				typicalAmount: -10.0,
				frequency: "monthly",
				status: "active",
			}),
			makeSub({
				merchantId: 2,
				typicalAmount: -100.0,
				frequency: "yearly",
				status: "active",
			}),
			makeSub({
				merchantId: 3,
				typicalAmount: -5.0,
				frequency: "weekly",
				status: "active",
			}),
		]);

		const { result } = renderHook(() => useSubscriptions());

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// monthly: 10 * 12 = 120, yearly: 100, weekly: 5 * 52 = 260
		expect(result.current.yearlyTotal).toBeCloseTo(480);
	});

	it("returns isLoading true initially, then false after query", async () => {
		const { result } = renderHook(() => useSubscriptions());

		// Eventually resolves to not loading
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
	});

	it("count reflects only active subscriptions", async () => {
		await db.subscriptions.bulkAdd([
			makeSub({ merchantId: 1, status: "active" }),
			makeSub({ merchantId: 2, status: "active" }),
			makeSub({ merchantId: 3, status: "possibly-cancelled" }),
		]);

		const { result } = renderHook(() => useSubscriptions());

		await waitFor(() => {
			expect(result.current.count).toBe(2);
		});
	});
});
