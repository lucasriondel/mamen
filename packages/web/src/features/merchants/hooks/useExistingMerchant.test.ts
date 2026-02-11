import "fake-indexeddb/auto";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { useExistingMerchant } from "./useExistingMerchant";

describe("useExistingMerchant", () => {
	beforeEach(async () => {
		await db.merchants.clear();
		await db.rules.clear();
	});

	it("returns null merchant and empty rules for null merchantId", () => {
		const { result } = renderHook(() => useExistingMerchant(null));

		expect(result.current.merchant).toBeNull();
		expect(result.current.rules).toEqual([]);
	});

	it("returns merchant and rules for valid merchantId", async () => {
		const merchantId = (await db.merchants.add({
			name: "Amazon",
			defaultCategoryId: 1,
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		await db.rules.add({
			merchantId,
			pattern: "^AMZN.*",
			matchCount: 5,
			createdAt: new Date(),
		});

		const { result } = renderHook(() => useExistingMerchant(merchantId));

		await waitFor(() => {
			expect(result.current.merchant).not.toBeNull();
			expect(result.current.merchant?.name).toBe("Amazon");
			expect(result.current.rules).toHaveLength(1);
			expect(result.current.rules[0].pattern).toBe("^AMZN.*");
		});
	});

	it("returns null merchant for non-existent merchantId", async () => {
		const { result } = renderHook(() => useExistingMerchant(999));

		await waitFor(() => {
			expect(result.current.merchant).toBeNull();
			expect(result.current.rules).toEqual([]);
		});
	});

	it("returns multiple rules for merchant with many rules", async () => {
		const merchantId = (await db.merchants.add({
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		await db.rules.bulkAdd([
			{ merchantId, pattern: "^AMZN.*", matchCount: 5, createdAt: new Date() },
			{
				merchantId,
				pattern: "^AMAZON.*",
				matchCount: 3,
				createdAt: new Date(),
			},
		]);

		const { result } = renderHook(() => useExistingMerchant(merchantId));

		await waitFor(() => {
			expect(result.current.rules).toHaveLength(2);
		});
	});
});
