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

// A tiny two-level tree: two folders, each with leaves. Folders (parentId null)
// are unselectable — headings only; leaves are the only assignable kind.
const CATEGORIES = [
	{
		id: 1,
		name: "Food",
		slug: "food",
		icon: "🍔",
		parentId: null,
		sortOrder: 0,
	},
	{
		id: 2,
		name: "Groceries",
		slug: "groceries",
		icon: "🛒",
		parentId: 1,
		sortOrder: 0,
	},
	{
		id: 3,
		name: "Restaurants",
		slug: "restaurants",
		icon: "🍽️",
		parentId: 1,
		sortOrder: 1,
	},
	{
		id: 4,
		name: "Life",
		slug: "life",
		icon: "💫",
		parentId: null,
		sortOrder: 1,
	},
	{
		id: 5,
		name: "Subscriptions",
		slug: "subs",
		icon: "🔁",
		parentId: 4,
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
