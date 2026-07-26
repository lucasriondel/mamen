import type { Category, Transaction } from "@mamen/shared/contract";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam (PRD "Seam 2"): the picker reads the category tree
// (`categoryQueries.list`) and writes overrides through `transactionMutations.update`
// (apply → `manualCategory: true`; remove → `manualCategory: false`). Real key
// factories are kept so the mutations' invalidation resolves. cmdk's jsdom shims
// (ResizeObserver, scrollIntoView) live in `src/test/setup.ts`.
const updateTransaction = vi.fn();
const createCategory = vi.fn();

// A tiny two-level tree: two folders, each with leaves. Folders (parentId null)
// are unselectable — headings only; leaves are the only assignable kind.
const CATEGORIES = [
	{
		id: 1,
		name: "Food",
		slug: "food",
		icon: "utensils-crossed",
		parentId: null,
		sortOrder: 0,
	},
	{
		id: 2,
		name: "Groceries",
		slug: "groceries",
		icon: "shopping-cart",
		parentId: 1,
		sortOrder: 0,
	},
	{
		id: 3,
		name: "Restaurants",
		slug: "restaurants",
		icon: "utensils",
		parentId: 1,
		sortOrder: 1,
	},
	{
		id: 4,
		name: "Life",
		slug: "life",
		icon: "sparkles",
		parentId: null,
		sortOrder: 1,
	},
	{
		id: 5,
		name: "Subscriptions",
		slug: "subs",
		icon: "repeat",
		parentId: 4,
		sortOrder: 0,
	},
	// A depth-3 branch: Life › Utilities › Electricity. Utilities is a mid-tier
	// folder (heading only); Electricity is a leaf three deep (still selectable).
	{
		id: 6,
		name: "Utilities",
		slug: "utilities",
		icon: "plug",
		parentId: 4,
		sortOrder: 1,
	},
	{
		id: 7,
		name: "Electricity",
		slug: "electricity",
		icon: "zap",
		parentId: 6,
		sortOrder: 0,
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
		transactionMutations: {
			update: (id: unknown, payload: unknown) => updateTransaction(id, payload),
		},
	};
});

// Imported after the mock so it binds to the mocked SDK surface.
const { CategoryPicker } = await import("./category-picker");

/** A minimal transaction — only the fields the picker reads. */
function tx(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 100,
		accountId: 1,
		date: new Date(),
		amount: -9.99,
		rawIssuerString: "ACME",
		importedAt: new Date(),
		importMonth: "2026-01",
		...over,
	} as Transaction;
}

const groceries = CATEGORIES[1] as unknown as Category;

beforeEach(() => {
	updateTransaction.mockReset().mockResolvedValue({ id: 100 });
	createCategory
		.mockReset()
		.mockResolvedValue({ id: 42, name: "Coffee gear", parentId: 1 });
});

async function open(name: RegExp) {
	const user = userEvent.setup();
	await user.click(await screen.findByRole("button", { name }));
	await screen.findByLabelText("Search categories");
	return user;
}

describe("CategoryPicker", () => {
	it("applies an override on an issuer-less, unassigned row (manualCategory)", async () => {
		// No issuer, no category → the trigger reads Unassigned, and the override
		// path must still work (resolving the issuer is not a prerequisite).
		render(<CategoryPicker transaction={tx({ id: 100 })} />);
		const user = await open(/Unassigned/);

		await user.click(screen.getByText("Groceries"));

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				categoryId: 2,
				manualCategory: true,
			}),
		);
	});

	it("offers leaves only — folders are headings, not options", async () => {
		render(<CategoryPicker transaction={tx()} />);
		await open(/Unassigned/);

		const optionNames = screen.getAllByRole("option").map((o) => o.textContent);
		expect(optionNames.some((n) => n?.includes("Groceries"))).toBe(true);
		expect(optionNames.some((n) => n?.includes("Subscriptions"))).toBe(true);
		// The folders appear as headings, never as selectable options.
		expect(optionNames.some((n) => n?.includes("Food"))).toBe(false);
		expect(optionNames.some((n) => n?.includes("Life"))).toBe(false);
	});

	it("renders the tree to arbitrary depth: a depth-3 leaf is selectable, its mid-tier folder a heading", async () => {
		render(<CategoryPicker transaction={tx({ id: 100 })} />);
		const user = await open(/Unassigned/);

		const optionNames = screen.getAllByRole("option").map((o) => o.textContent);
		// Electricity sits three deep and is still an assignable option…
		expect(optionNames.some((n) => n?.includes("Electricity"))).toBe(true);
		// …while its mid-tier folder Utilities is a heading, never an option.
		expect(optionNames.some((n) => n?.includes("Utilities"))).toBe(false);
		expect(screen.getByText("Utilities")).toBeInTheDocument();

		// Selecting the deep leaf writes its id as the override, no path involved.
		await user.click(screen.getByText("Electricity"));
		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				categoryId: 7,
				manualCategory: true,
			}),
		);
	});

	it("searching filters the leaves by name", async () => {
		render(<CategoryPicker transaction={tx()} />);
		const user = await open(/Unassigned/);

		await user.type(screen.getByLabelText("Search categories"), "groc");

		expect(screen.getByText("Groceries")).toBeInTheDocument();
		expect(screen.queryByText("Restaurants")).not.toBeInTheDocument();
		expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
	});

	it("removes an override on a marked row, reverting to the issuer default", async () => {
		// A manual (override) row → the trigger names the leaf and Remove is offered.
		render(
			<CategoryPicker
				transaction={tx({ id: 101, manualCategory: true })}
				category={groceries}
			/>,
		);
		const user = await open(/Groceries/);

		await user.click(await screen.findByText("Remove override"));

		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(101, {
				manualCategory: false,
			}),
		);
	});

	it("offers to create a leaf when the typed name matches nothing", async () => {
		render(<CategoryPicker transaction={tx()} />);
		const user = await open(/Unassigned/);

		await user.type(screen.getByLabelText("Search categories"), "Coffee gear");

		// Nothing matches, so the create affordance appears, naming the query.
		expect(screen.getByText(/Create.*Coffee gear/)).toBeInTheDocument();
	});

	it("does not offer to create when the name already exists as a leaf", async () => {
		render(<CategoryPicker transaction={tx()} />);
		const user = await open(/Unassigned/);

		await user.type(screen.getByLabelText("Search categories"), "Groceries");

		expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
	});

	it("creates a leaf in a chosen folder and applies it to the transaction", async () => {
		// Two-step create: type a name → pick the folder → the leaf is created with
		// the typed name pre-filled and applied to THIS transaction as an override,
		// all without leaving the popover.
		render(<CategoryPicker transaction={tx({ id: 100 })} />);
		const user = await open(/Unassigned/);

		await user.type(screen.getByLabelText("Search categories"), "Coffee gear");
		await user.click(screen.getByText(/Create.*Coffee gear/));

		// Step two: asked which folder the new leaf belongs in — folders only.
		expect(await screen.findByText("Food")).toBeInTheDocument();
		expect(screen.getByText("Life")).toBeInTheDocument();
		await user.click(screen.getByText("Food"));

		// The leaf is created under the chosen folder with the pre-filled name.
		await waitFor(() =>
			expect(createCategory).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Coffee gear", parentId: 1 }),
			),
		);
		// …then applied to this transaction as an override.
		await waitFor(() =>
			expect(updateTransaction).toHaveBeenCalledWith(100, {
				categoryId: 42,
				manualCategory: true,
			}),
		);
	});

	it("hides the remove action on an inherited (non-override) row", async () => {
		// Category derived through the issuer, not manual → nothing to remove, so
		// the menu never offers the no-op.
		render(
			<CategoryPicker
				transaction={tx({ id: 102, manualCategory: false })}
				category={groceries}
			/>,
		);
		await open(/Groceries/);

		expect(screen.queryByText("Remove override")).not.toBeInTheDocument();
	});
});
