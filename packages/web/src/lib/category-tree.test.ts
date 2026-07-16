import type { Category } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import {
	buildTree,
	categoryPath,
	descendantIds,
	isFolder,
	isLeaf,
	searchTree,
	subtreeIds,
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
		it("reads a node with children as a folder and a childless node as a leaf", () => {
			const { food, groceries, categories } = seed();
			expect(isFolder(categories, food)).toBe(true);
			expect(isLeaf(categories, food)).toBe(false);
			expect(isFolder(categories, groceries)).toBe(false);
			expect(isLeaf(categories, groceries)).toBe(true);
		});

		it("reads an empty root as a leaf, not a folder — childlessness, not root-ness", () => {
			// ADR 0003 / issue #32: Home has no parent but also no children, so it is
			// an assignable leaf, not a grouping folder. The old `parentId === null`
			// proxy called it a folder.
			const { home, categories } = seed();
			expect(isFolder(categories, home)).toBe(false);
			expect(isLeaf(categories, home)).toBe(true);
		});

		it("reads a nested node with children as a folder — depth is not root-ness", () => {
			// A mid-tier node with a child of its own is a folder even though it has
			// a parent; the old proxy called it a leaf.
			nextId = 1;
			const life = category({ name: "Life" });
			const subs = category({ name: "Subscriptions", parentId: life.id });
			const streaming = category({ name: "Streaming", parentId: subs.id });
			const categories = [life, subs, streaming];
			expect(isFolder(categories, subs)).toBe(true);
			expect(isLeaf(categories, streaming)).toBe(true);
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

	describe("subtreeIds", () => {
		it("includes the node itself and every descendant, folders included", () => {
			nextId = 1;
			const life = category({ name: "Life" });
			const subs = category({ name: "Subscriptions", parentId: life.id });
			const streaming = category({ name: "Streaming", parentId: subs.id });
			const bills = category({ name: "Bills", parentId: life.id });
			const food = category({ name: "Food" });
			const categories = [life, subs, streaming, bills, food];

			const ids = subtreeIds(categories, life.id);
			// Life, the mid-tier Subscriptions folder, and the leaves beneath — but
			// never a sibling tree (Food).
			expect(ids).toEqual(new Set([life.id, subs.id, streaming.id, bills.id]));
			expect(ids.has(food.id)).toBe(false);
		});

		it("is just the node for a childless leaf", () => {
			const { groceries, categories } = seed();
			expect(subtreeIds(categories, groceries.id)).toEqual(
				new Set([groceries.id]),
			);
		});
	});

	describe("searchTree", () => {
		it("flattens the forest DFS, folders as headings and leaves selectable, with depth", () => {
			const { food, home, groceries, restaurants, categories } = seed();
			// Food{Groceries, Restaurants}, Home (empty root → a leaf), orphan dropped.
			expect(searchTree(categories, "")).toEqual([
				{ category: food, depth: 0, isLeaf: false },
				{ category: groceries, depth: 1, isLeaf: true },
				{ category: restaurants, depth: 1, isLeaf: true },
				{ category: home, depth: 0, isLeaf: true },
			]);
		});

		it("keeps folder headings at every level and marks childless nodes at any depth selectable", () => {
			// Life > Subscriptions > Streaming(leaf); Life > Bills(leaf). The mid-tier
			// Subscriptions is a folder heading at depth 1; Streaming is a leaf at depth 2.
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
			const categories = [life, subs, bills, streaming];
			expect(searchTree(categories, "")).toEqual([
				{ category: life, depth: 0, isLeaf: false },
				{ category: subs, depth: 1, isLeaf: false },
				{ category: streaming, depth: 2, isLeaf: true },
				{ category: bills, depth: 1, isLeaf: true },
			]);
		});

		it("keeps a folder heading iff a descendant leaf at any depth matches the query", () => {
			nextId = 1;
			const life = category({ name: "Life", sortOrder: 0 });
			const subs = category({
				name: "Subscriptions",
				parentId: life.id,
				sortOrder: 0,
			});
			const streaming = category({
				name: "Streaming",
				parentId: subs.id,
				sortOrder: 0,
			});
			const bills = category({
				name: "Bills",
				parentId: life.id,
				sortOrder: 1,
			});
			const categories = [life, subs, streaming, bills];
			// "stream" matches only the depth-3 leaf; its ancestor folders survive as
			// headings, the non-matching sibling leaf is dropped.
			expect(searchTree(categories, "stream")).toEqual([
				{ category: life, depth: 0, isLeaf: false },
				{ category: subs, depth: 1, isLeaf: false },
				{ category: streaming, depth: 2, isLeaf: true },
			]);
			// A query matching nothing drops the whole tree, empty folders included.
			expect(searchTree(categories, "zzz")).toEqual([]);
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
