import type { Category } from "@mamen/shared/contract";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK boundary (PRD "Seam 2"): the categories page reads the categories
// `list` and groups the flat rows into folders-with-leaves for display.
let categoriesList: Category[];
let listShouldFail: boolean;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: async () => {
					if (listShouldFail) throw new Error("boom");
					return {
						items: categoriesList,
						total: categoriesList.length,
					};
				},
			}),
		},
	};
});

const { CategoriesView } = await import("./categories-view");

let nextId = 1;
function category(over: Partial<Category> = {}): Category {
	return {
		id: nextId++ as Category["id"],
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

describe("CategoriesView", () => {
	beforeEach(() => {
		nextId = 1;
		categoriesList = [];
		listShouldFail = false;
	});

	it("renders each folder with its leaves grouped beneath it", async () => {
		const food = category({ name: "Food", slug: "food", sortOrder: 0 });
		const home = category({ name: "Home", slug: "home", sortOrder: 1 });
		categoriesList = [
			food,
			home,
			category({
				name: "Groceries",
				slug: "groceries",
				parentId: food.id,
				sortOrder: 0,
			}),
			category({
				name: "Restaurants",
				slug: "restaurants",
				parentId: food.id,
				sortOrder: 1,
			}),
			category({ name: "Rent", slug: "rent", parentId: home.id, sortOrder: 0 }),
		];

		render(<CategoriesView />);

		// Folder headings show.
		const foodGroup = await screen.findByRole("group", { name: /food/i });
		const homeGroup = screen.getByRole("group", { name: /home/i });

		// Each leaf sits under its own folder, not the other.
		expect(within(foodGroup).getByText("Groceries")).toBeInTheDocument();
		expect(within(foodGroup).getByText("Restaurants")).toBeInTheDocument();
		expect(within(foodGroup).queryByText("Rent")).not.toBeInTheDocument();
		expect(within(homeGroup).getByText("Rent")).toBeInTheDocument();
	});

	it("shows an empty state when there are no categories", async () => {
		categoriesList = [];
		render(<CategoriesView />);
		expect(await screen.findByText(/no categories/i)).toBeInTheDocument();
	});

	it("shows an error state when the list read fails", async () => {
		listShouldFail = true;
		render(<CategoriesView />);
		// `retry: 1` on the shared client means one backoff (~1s) before the error
		// surfaces, so allow extra time here.
		expect(
			await screen.findByText(/couldn't load categories/i, undefined, {
				timeout: 4000,
			}),
		).toBeInTheDocument();
	});
});
