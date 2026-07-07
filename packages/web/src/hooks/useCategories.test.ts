import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { useCategories } from "./useCategories";

const CATEGORIES = [
	{
		name: "Shopping",
		color: "#3B82F6",
		icon: "ShoppingCart",
		subs: ["Online", "Groceries", "Clothing", "Electronics", "Other"],
	},
	{
		name: "Dining",
		color: "#F97316",
		icon: "Utensils",
		subs: ["Restaurants", "Coffee", "Fast Food", "Delivery"],
	},
	{
		name: "Transportation",
		color: "#06B6D4",
		icon: "Car",
		subs: ["Rideshare", "Public Transit", "Gas", "Parking"],
	},
	{
		name: "Subscriptions",
		color: "#8B5CF6",
		icon: "Repeat",
		subs: ["Streaming", "Software", "Memberships"],
	},
	{
		name: "Housing",
		color: "#64748B",
		icon: "Home",
		subs: ["Rent", "Utilities", "Insurance", "Maintenance"],
	},
	{
		name: "Health",
		color: "#EF4444",
		icon: "Heart",
		subs: ["Medical", "Pharmacy", "Fitness"],
	},
	{
		name: "Entertainment",
		color: "#EC4899",
		icon: "Gamepad2",
		subs: ["Events", "Games", "Hobbies"],
	},
	{
		name: "Travel",
		color: "#22C55E",
		icon: "Plane",
		subs: ["Flights", "Hotels", "Activities"],
	},
	{
		name: "Income",
		color: "#10B981",
		icon: "TrendingUp",
		subs: ["Salary", "Freelance", "Refunds", "Other"],
	},
	{
		name: "Other",
		color: "#6B7280",
		icon: "MoreHorizontal",
		subs: ["Uncategorized"],
	},
] as const;

const toSlug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

const seedCategories = async () => {
	const now = new Date();
	for (const [i, cat] of CATEGORIES.entries()) {
		const parentId = await db.categories.add({
			name: cat.name,
			slug: toSlug(cat.name),
			color: cat.color,
			icon: cat.icon,
			parentId: null,
			sortOrder: i,
			createdAt: now,
		});
		for (const [j, sub] of cat.subs.entries()) {
			await db.categories.add({
				name: sub,
				slug: `${toSlug(cat.name)}-${toSlug(sub)}`,
				color: cat.color,
				icon: cat.icon,
				parentId,
				sortOrder: j,
				createdAt: now,
			});
		}
	}
};

beforeEach(async () => {
	await db.categories.clear();
	await seedCategories();
});

describe("useCategories", () => {
	it("returns all categories", async () => {
		const { result } = renderHook(() => useCategories());

		await waitFor(() => {
			expect(result.current.categories.length).toBeGreaterThan(0);
		});

		const allCount = await db.categories.count();
		expect(result.current.categories).toHaveLength(allCount);
	});

	it("returns parent categories only", async () => {
		const { result } = renderHook(() => useCategories());

		await waitFor(() => {
			expect(result.current.parentCategories.length).toBeGreaterThan(0);
		});

		expect(result.current.parentCategories).toHaveLength(10);
		for (const parent of result.current.parentCategories) {
			expect(parent.parentId).toBeNull();
		}
	});

	it("groups subcategories correctly", async () => {
		const { result } = renderHook(() => useCategories());

		await waitFor(() => {
			expect(result.current.categoriesWithSubs.length).toBeGreaterThan(0);
		});

		const shopping = result.current.categoriesWithSubs.find(
			(c) => c.name === "Shopping",
		)!;
		expect(shopping).toBeDefined();
		expect(shopping.subcategories).toHaveLength(5);
		expect(shopping.subcategories.map((s) => s.name)).toContain("Groceries");
	});

	it("getSubcategories returns correct children", async () => {
		const { result } = renderHook(() => useCategories());

		await waitFor(() => {
			expect(result.current.parentCategories.length).toBeGreaterThan(0);
		});

		const dining = result.current.parentCategories.find(
			(c) => c.name === "Dining",
		)!;
		const subs = result.current.getSubcategories(dining.id!);
		expect(subs).toHaveLength(4);
		expect(subs.map((s) => s.name)).toContain("Coffee");
	});

	it("getCategoryById returns correct category", async () => {
		const { result } = renderHook(() => useCategories());

		await waitFor(() => {
			expect(result.current.categories.length).toBeGreaterThan(0);
		});

		const firstCategory = result.current.categories[0];
		const found = result.current.getCategoryById(firstCategory.id!);
		expect(found).toEqual(firstCategory);
	});

	it("getCategoryById returns undefined for non-existent id", async () => {
		const { result } = renderHook(() => useCategories());

		await waitFor(() => {
			expect(result.current.categories.length).toBeGreaterThan(0);
		});

		const found = result.current.getCategoryById(99999);
		expect(found).toBeUndefined();
	});
});
