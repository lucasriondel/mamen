import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { seedCategories } from "./categories";

beforeEach(async () => {
	await db.categories.clear();
});

describe("seedCategories", () => {
	it("seeds categories on first run", async () => {
		await seedCategories();

		const count = await db.categories.count();
		expect(count).toBeGreaterThan(0);
	});

	it("does not duplicate on subsequent runs", async () => {
		await seedCategories();
		const firstCount = await db.categories.count();

		await seedCategories();
		const secondCount = await db.categories.count();

		expect(secondCount).toBe(firstCount);
	});

	it("creates all 10 parent categories", async () => {
		await seedCategories();

		const parents = await db.categories.where("parentId").equals(0).toArray();
		// parentId is null for parents, but Dexie indexes don't index null
		// So query differently
		const allCategories = await db.categories.toArray();
		const parentCategories = allCategories.filter((c) => c.parentId === null);

		expect(parentCategories).toHaveLength(10);

		const names = parentCategories.map((c) => c.name).sort();
		expect(names).toEqual([
			"Dining",
			"Entertainment",
			"Health",
			"Housing",
			"Income",
			"Other",
			"Shopping",
			"Subscriptions",
			"Transportation",
			"Travel",
		]);
	});

	it("links all subcategories correctly", async () => {
		await seedCategories();

		const allCategories = await db.categories.toArray();
		const parents = allCategories.filter((c) => c.parentId === null);
		const subs = allCategories.filter((c) => c.parentId !== null);

		// Every subcategory should reference a valid parent
		for (const sub of subs) {
			const parent = parents.find((p) => p.id === sub.parentId);
			expect(parent).toBeDefined();
		}

		// Check specific subcategory counts
		const shopping = parents.find((p) => p.name === "Shopping")!;
		const shoppingSubs = subs.filter((s) => s.parentId === shopping.id);
		expect(shoppingSubs).toHaveLength(5);
		expect(shoppingSubs.map((s) => s.name).sort()).toEqual([
			"Clothing",
			"Electronics",
			"Groceries",
			"Online",
			"Other",
		]);

		const dining = parents.find((p) => p.name === "Dining")!;
		const diningSubs = subs.filter((s) => s.parentId === dining.id);
		expect(diningSubs).toHaveLength(4);
	});

	it("assigns correct colors to categories", async () => {
		await seedCategories();

		const allCategories = await db.categories.toArray();
		const shopping = allCategories.find(
			(c) => c.name === "Shopping" && c.parentId === null,
		)!;
		expect(shopping.color).toBe("#3B82F6");

		const dining = allCategories.find(
			(c) => c.name === "Dining" && c.parentId === null,
		)!;
		expect(dining.color).toBe("#F97316");
	});

	it("assigns correct icons to categories", async () => {
		await seedCategories();

		const allCategories = await db.categories.toArray();
		const shopping = allCategories.find(
			(c) => c.name === "Shopping" && c.parentId === null,
		)!;
		expect(shopping.icon).toBe("ShoppingCart");

		const travel = allCategories.find(
			(c) => c.name === "Travel" && c.parentId === null,
		)!;
		expect(travel.icon).toBe("Plane");
	});

	it("assigns slugs in kebab-case", async () => {
		await seedCategories();

		const allCategories = await db.categories.toArray();
		for (const category of allCategories) {
			expect(category.slug).toMatch(/^[a-z0-9-]+$/);
		}

		const fastFood = allCategories.find((c) => c.name === "Fast Food")!;
		expect(fastFood.slug).toBe("dining-fast-food");
	});

	it("subcategories inherit parent color and icon", async () => {
		await seedCategories();

		const allCategories = await db.categories.toArray();
		const shopping = allCategories.find(
			(c) => c.name === "Shopping" && c.parentId === null,
		)!;
		const groceries = allCategories.find((c) => c.name === "Groceries")!;

		expect(groceries.color).toBe(shopping.color);
		expect(groceries.icon).toBe(shopping.icon);
		expect(groceries.parentId).toBe(shopping.id);
	});
});
