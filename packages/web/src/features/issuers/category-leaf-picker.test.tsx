import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The inline **create a category** flow on the leaf picker: search for a
 * category that doesn't exist, take the "Create …" row, and fill the dialog
 * (name, parent, icon) without leaving the record being edited.
 *
 * Mocks the SDK seam — the picker reads the tree (`categoryQueries.list`) and
 * the dialog writes through `categoryMutations.create`. cmdk's jsdom shims
 * (ResizeObserver, scrollIntoView) live in `src/test/setup.ts`.
 */
const createCategory = vi.fn();

// Food (folder) › Groceries (leaf), plus Life as a childless root — itself a
// leaf under ADR 0003, so it is assignable and blocks a same-named create.
const CATEGORIES = [
	{
		id: 1,
		name: "Food",
		slug: "food",
		color: "#ff0000",
		icon: "utensils-crossed",
		parentId: null,
		sortOrder: 0,
	},
	{
		id: 2,
		name: "Groceries",
		slug: "groceries",
		color: null,
		icon: "shopping-cart",
		parentId: 1,
		sortOrder: 0,
	},
	{
		id: 3,
		name: "Life",
		slug: "life",
		color: null,
		icon: "sparkles",
		parentId: null,
		sortOrder: 1,
	},
];

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: async () => ({ items: CATEGORIES, total: CATEGORIES.length }),
			}),
		},
		categoryMutations: {
			create: (payload: unknown) => createCategory(payload),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { CategoryLeafPicker } = await import("./category-leaf-picker");

beforeEach(() => {
	createCategory.mockReset().mockResolvedValue({
		id: 42,
		name: "Coffee gear",
		slug: "coffee-gear",
		color: null,
		icon: "tag",
		parentId: 1,
		sortOrder: 0,
	});
});

function renderPicker(onChange = vi.fn()) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<CategoryLeafPicker
				value={null}
				onChange={onChange}
				title="Set this issuer's default category"
				selectedLabel="Current default"
				clearLabel="Remove default category"
			/>
		</QueryClientProvider>,
	);
	return onChange;
}

/** Open the popover and type a search query. */
async function search(query: string) {
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name: /No category/i }));
	await screen.findByLabelText("Search categories");
	// Wait for the tree so the exact-leaf check runs against real data.
	await screen.findByText("Groceries");
	await user.type(screen.getByLabelText("Search categories"), query);
	return user;
}

describe("CategoryLeafPicker — inline create", () => {
	it("offers a Create row when the search matches no leaf", async () => {
		renderPicker();
		await search("Coffee gear");

		expect(
			await screen.findByText(/Create category “Coffee gear”/),
		).toBeInTheDocument();
	});

	it("does not offer a Create row for a leaf that already exists", async () => {
		renderPicker();
		await search("groceries");

		expect(screen.getByText("Groceries")).toBeInTheDocument();
		expect(screen.queryByText(/Create category/)).not.toBeInTheDocument();
	});

	it("still offers a Create row when only a folder carries the name", async () => {
		// "Food" is structural — it can't be picked, so it must not block minting
		// an assignable leaf by the same name.
		renderPicker();
		await search("Food");

		expect(
			await screen.findByText(/Create category “Food”/),
		).toBeInTheDocument();
	});

	it("creates the category with the typed name, chosen parent and icon, then selects it", async () => {
		const onChange = renderPicker();
		const user = await search("Coffee gear");

		await user.click(await screen.findByText(/Create category “Coffee gear”/));

		// The dialog opens with the search text already in the name field.
		const name = await screen.findByLabelText("Category name");
		expect(name).toHaveValue("Coffee gear");

		// Put it under Food rather than at the top level. The parent picker is the
		// same searchable tree the leaf picker uses — except a folder is a real,
		// selectable option here, since any node is a legal parent (ADR 0003).
		await user.click(screen.getByRole("button", { name: /Top level/i }));
		await screen.findByLabelText("Search parent categories");
		await user.click(await screen.findByText("Food"));

		await user.click(
			screen.getByRole("button", { name: "Create category", hidden: true }),
		);

		await waitFor(() =>
			expect(createCategory).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Coffee gear",
					slug: "coffee-gear",
					parentId: 1,
					// A new category inherits its colour (ADR 0006).
					color: null,
					icon: "tag",
				}),
			),
		);

		// The whole point of creating it here: it is selected straight away.
		await waitFor(() => expect(onChange).toHaveBeenCalledWith(42));
	});

	it("offers folders as parents but no nested create row", async () => {
		renderPicker();
		const user = await search("Coffee gear");
		await user.click(await screen.findByText(/Create category “Coffee gear”/));
		await screen.findByLabelText("Category name");

		await user.click(screen.getByRole("button", { name: /Top level/i }));
		await screen.findByLabelText("Search parent categories");

		// Any node is a legal parent, so the folder Food is selectable here —
		// unlike in the leaf picker, where it is only a heading.
		const optionNames = screen.getAllByRole("option").map((o) => o.textContent);
		expect(optionNames.some((n) => n?.includes("Food"))).toBe(true);
		expect(optionNames.some((n) => n?.includes("Groceries"))).toBe(true);

		// No create-inside-create: the search here lives inside the create flow.
		// Scoped to this popover — the leaf picker behind the dialog still holds
		// its own Create row, which is not what's under test.
		const parentList = screen
			.getByLabelText("Search parent categories")
			.closest("[cmdk-root]") as HTMLElement;
		await user.type(
			screen.getByLabelText("Search parent categories"),
			"Nonexistent",
		);
		await waitFor(() =>
			expect(parentList).toHaveTextContent("No categories found."),
		);
		expect(parentList).not.toHaveTextContent(/Create category/);
	});

	it("creates at the top level when no parent is chosen", async () => {
		renderPicker();
		const user = await search("Coffee gear");

		await user.click(await screen.findByText(/Create category “Coffee gear”/));
		await screen.findByLabelText("Category name");
		await user.click(
			screen.getByRole("button", { name: "Create category", hidden: true }),
		);

		await waitFor(() =>
			expect(createCategory).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Coffee gear", parentId: null }),
			),
		);
	});
});
