import type { Category } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import {
	buildTree,
	categoryPath,
	descendantIds,
	foldersWithLeaves,
	isFolder,
	isLeaf,
	searchFolders,
} from "./category-tree";

let nextId = 1;
function category(over: Partial<Category> = {}): Category {
	return {
		id: nextId++,
		name: "Food",
		slug: "food",
		color: "#ef4444",
		icon: "🍔",
		parentId: null,
		sortOrder: 0,
		createdAt: new Date("2026-01-01"),
		...over,
	} as Category;
}

/** Food{Groceries, Restaurants}, Home (empty), plus an orphan leaf. */
function seed() {
	nextId = 1;
	const food = category({ name: "Food", sortOrder: 0 });
	const home = category({ name: "Home", sortOrder: 1 });
	const groceries = category({
		name: "Groceries",
		parentId: food.id,
		sortOrder: 0,
	});
	const restaurants = category({
		name: "Restaurants",
		parentId: food.id,
		sortOrder: 1,
	});
	const orphan = category({ name: "Orphan", parentId: 999, sortOrder: 0 });
	const categories = [food, home, groceries, restaurants, orphan];
	return { food, home, groceries, restaurants, orphan, categories };
}

describe("category-tree", () => {
	describe("the folder / leaf split", () => {
		it("reads a root as a folder and a parented node as a leaf", () => {
			const { food, groceries } = seed();
			expect(isFolder(food)).toBe(true);
			expect(isLeaf(food)).toBe(false);
			expect(isFolder(groceries)).toBe(false);
			expect(isLeaf(groceries)).toBe(true);
		});
	});

	describe("buildTree", () => {
		it("nests leaves under their folder in sort order", () => {
			const { food, categories } = seed();
			const tree = buildTree(categories);
			const foodNode = tree.find((n) => n.id === food.id);
			expect(foodNode?.children.map((c) => c.name)).toEqual([
				"Groceries",
				"Restaurants",
			]);
		});

		it("keeps a childless folder as an empty node", () => {
			const { home, categories } = seed();
			const tree = buildTree(categories);
			expect(tree.find((n) => n.id === home.id)?.children).toEqual([]);
		});

		it("drops an orphan whose parent is absent — no invented structure", () => {
			const { categories } = seed();
			const names = buildTree(categories).map((n) => n.name);
			expect(names).toEqual(["Food", "Home"]);
		});
	});

	describe("foldersWithLeaves", () => {
		it("pairs every folder with its leaves, keeping empty folders", () => {
			const { food, home, categories } = seed();
			const groups = foldersWithLeaves(categories);
			expect(groups.map((g) => g.folder.id)).toEqual([food.id, home.id]);
			expect(groups.find((g) => g.folder.id === home.id)?.leaves).toHaveLength(
				0,
			);
		});
	});

	describe("searchFolders", () => {
		it("keeps only leaves matching the query and drops emptied folders", () => {
			const { food, categories } = seed();
			const groups = searchFolders(categories, "gro");
			expect(groups).toHaveLength(1);
			expect(groups[0].folder.id).toBe(food.id);
			expect(groups[0].leaves.map((l) => l.name)).toEqual(["Groceries"]);
		});

		it("matches case-insensitively and ignores surrounding whitespace", () => {
			const { categories } = seed();
			const groups = searchFolders(categories, "  RESTAURANT ");
			expect(groups[0].leaves.map((l) => l.name)).toEqual(["Restaurants"]);
		});

		it("returns every folder with a leaf on an empty query", () => {
			const { categories } = seed();
			const groups = searchFolders(categories, "");
			expect(groups.map((g) => g.folder.name)).toEqual(["Food"]);
		});
	});

	describe("descendantIds", () => {
		it("expands a folder to its leaf ids (one hop)", () => {
			const { food, groceries, restaurants, categories } = seed();
			expect(descendantIds(categories, food.id)).toEqual([
				groceries.id,
				restaurants.id,
			]);
		});

		it("yields nothing for a leaf or an unknown id", () => {
			const { groceries, categories } = seed();
			expect(descendantIds(categories, groceries.id)).toEqual([]);
			expect(descendantIds(categories, 12345)).toEqual([]);
		});

		it("descends the whole subtree to a leaf at any depth", () => {
			// Life > Subscriptions > {Streaming (leaf), Music (leaf)}; Life > Bills
			// (leaf). Rolling up Life must reach the depth-3 leaves and the depth-2
			// leaf, but never the intermediate Subscriptions folder — it holds no
			// money, and the money hangs on the leaves beneath it.
			nextId = 1;
			const life = category({ name: "Life", sortOrder: 0 });
			const subs = category({
				name: "Subscriptions",
				parentId: life.id,
				sortOrder: 0,
			});
			const bills = category({
				name: "Bills",
				parentId: life.id,
				sortOrder: 1,
			});
			const streaming = category({
				name: "Streaming",
				parentId: subs.id,
				sortOrder: 0,
			});
			const music = category({
				name: "Music",
				parentId: subs.id,
				sortOrder: 1,
			});
			const categories = [life, subs, bills, streaming, music];

			// The rollup of the root reaches every leaf, at depth 2 and depth 3, and
			// excludes the mid-tier folder.
			expect(descendantIds(categories, life.id)).toEqual([
				streaming.id,
				music.id,
				bills.id,
			]);
			// A mid-tier folder rolls up only its own subtree.
			expect(descendantIds(categories, subs.id)).toEqual([
				streaming.id,
				music.id,
			]);
		});
	});

	describe("categoryPath", () => {
		it("is the bare name for a root", () => {
			const { food, categories } = seed();
			expect(categoryPath(categories, food)).toBe("Food");
		});

		it("joins the chain from root to node for a nested leaf", () => {
			const { groceries, categories } = seed();
			expect(categoryPath(categories, groceries)).toBe("Food › Groceries");
		});
	});
});
