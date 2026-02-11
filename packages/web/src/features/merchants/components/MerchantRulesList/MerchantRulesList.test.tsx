import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { MerchantRulesList } from "./index";

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
});

describe("MerchantRulesList", () => {
	let merchantId: number;

	beforeEach(async () => {
		await db.merchants.clear();
		await db.rules.clear();
		await db.categories.clear();

		merchantId = (await db.merchants.add({
			name: "Amazon",
			defaultCategoryId: 1,
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;
	});

	it("displays rules with pattern and match count", async () => {
		await db.rules.add({
			merchantId,
			pattern: "^AMZN.*",
			matchCount: 5,
			createdAt: new Date(),
		});

		render(<MerchantRulesList merchantId={merchantId} />);

		await waitFor(() => {
			expect(screen.getByText("^AMZN.*")).toBeInTheDocument();
			expect(screen.getByText("(5 matches)")).toBeInTheDocument();
		});
	});

	it("shows default category indicator for rules without override", async () => {
		await db.rules.add({
			merchantId,
			pattern: "^AMZN.*",
			matchCount: 3,
			createdAt: new Date(),
		});

		render(<MerchantRulesList merchantId={merchantId} />);

		await waitFor(() => {
			expect(screen.getByText("(default)")).toBeInTheDocument();
		});
	});

	it("shows override category indicator", async () => {
		const catId = (await db.categories.add({
			name: "Electronics",
			slug: "electronics",
			parentId: null,
			color: "#ef4444",
			icon: "",
			sortOrder: 1,
			createdAt: new Date(),
		})) as number;

		await db.rules.add({
			merchantId,
			pattern: "^AMZN.*",
			categoryOverride: catId,
			matchCount: 3,
			createdAt: new Date(),
		});

		render(<MerchantRulesList merchantId={merchantId} />);

		await waitFor(() => {
			expect(screen.getByText(/Electronics/)).toBeInTheDocument();
		});
	});

	it("handles empty rules list", () => {
		render(<MerchantRulesList merchantId={merchantId} />);
		expect(screen.getByText("No existing rules")).toBeInTheDocument();
	});

	it("displays multiple rules", async () => {
		await db.rules.bulkAdd([
			{ merchantId, pattern: "^AMZN.*", matchCount: 5, createdAt: new Date() },
			{
				merchantId,
				pattern: "^AMAZON.*",
				matchCount: 3,
				createdAt: new Date(),
			},
		]);

		render(<MerchantRulesList merchantId={merchantId} />);

		await waitFor(() => {
			expect(screen.getByText("^AMZN.*")).toBeInTheDocument();
			expect(screen.getByText("^AMAZON.*")).toBeInTheDocument();
		});
	});
});
