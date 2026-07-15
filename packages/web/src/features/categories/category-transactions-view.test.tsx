import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateTransactionsSearch } from "../transactions/search";
import { CategoryTransactionsView } from "./category-transactions-view";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [{ id: 1, name: "Checking", type: "checking" }];
const ISSUERS = [{ id: 10, name: "Carrefour" }];

// Food (folder 1) → Groceries (leaf 5), Restaurants (leaf 6); Home (folder 2) →
// Rent (leaf 7). So a folder page (id 1) merges {5, 6}; a leaf page (id 5) is {5}.
const CATEGORIES = [
	{ id: 1, name: "Food", slug: "food", parentId: null, sortOrder: 0 },
	{ id: 2, name: "Home", slug: "home", parentId: null, sortOrder: 1 },
	{ id: 5, name: "Groceries", slug: "groceries", parentId: 1, sortOrder: 0 },
	{
		id: 6,
		name: "Restaurants",
		slug: "restaurants",
		parentId: 1,
		sortOrder: 1,
	},
	{ id: 7, name: "Rent", slug: "rent", parentId: 2, sortOrder: 0 },
];

const TXNS = [
	{
		id: 100,
		accountId: 1,
		date: new Date("2026-01-20T00:00:00Z"),
		amount: -42.5,
		rawIssuerString: "CARREFOUR 12",
		issuerId: 10,
		categoryId: 5,
		importedAt: new Date(),
		importMonth: "2026-01",
	},
];

// ---- SDK seam mock ----------------------------------------------------------

const listMock = vi.fn((params: Record<string, unknown>) => ({
	queryKey: ["transactions", "list", params],
	queryFn: async () => ({ items: TXNS, total: TXNS.length }),
}));

const countMock = vi.fn((params: Record<string, unknown>) => ({
	queryKey: ["transactions", "count", params],
	// A signed net total over the whole filtered set.
	queryFn: async () => ({ count: TXNS.length, total: -42.5 }),
}));

vi.mock("@mamen/sdk", () => ({
	transactionQueries: {
		list: (p: Record<string, unknown> = {}) => listMock(p),
		count: (p: Record<string, unknown> = {}) => countMock(p),
	},
	accountQueries: {
		list: () => ({
			queryKey: ["accounts", "list"],
			queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
		}),
	},
	issuerQueries: {
		list: () => ({
			queryKey: ["issuers", "list"],
			queryFn: async () => ({ items: ISSUERS, total: ISSUERS.length }),
		}),
	},
	categoryQueries: {
		list: () => ({
			queryKey: ["categories", "list"],
			queryFn: async () => ({ items: CATEGORIES, total: CATEGORIES.length }),
		}),
	},
	accountKeys: {},
	accountMutations: {},
	issuerKeys: {},
	issuerMutations: {},
	categoryKeys: {},
	categoryMutations: {},
	transactionKeys: {},
	transactionMutations: {},
}));

// ---- Router harness ---------------------------------------------------------

function makeRouter(initialEntry: string) {
	const rootRoute = createRootRoute();
	const categoriesRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/categories",
	});
	const categoryRoute = createRoute({
		getParentRoute: () => categoriesRoute,
		path: "/$categoryId",
		validateSearch: validateTransactionsSearch,
		component: CategoryTransactionsView,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([
			categoriesRoute.addChildren([categoryRoute]),
		]),
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
}

async function renderView(initialEntry: string) {
	const router = makeRouter(initialEntry);
	render(<RouterProvider router={router} />);
	return router;
}

beforeEach(() => {
	listMock.mockClear();
	countMock.mockClear();
});

describe("CategoryTransactionsView", () => {
	it("a leaf page filters by its own id and shows the total", async () => {
		await renderView("/categories/5");

		// The leaf's name heads the page.
		expect(
			await screen.findByRole("heading", { name: /Groceries/ }),
		).toBeInTheDocument();

		// The list and count are both scoped to exactly this leaf.
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5], orderBy: "date" }),
		);
		expect(countMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5] }),
		);

		// The signed net total from the count response is shown (it resolves async).
		await waitFor(() =>
			expect(screen.getByLabelText("Category total")).toHaveTextContent(
				/-42,50/,
			),
		);
		// And the reused transactions table renders the row.
		expect(screen.getByText("Carrefour")).toBeInTheDocument();
	});

	it("a folder page merges its leaves' ids into one filtered query", async () => {
		await renderView("/categories/1");

		expect(
			await screen.findByRole("heading", { name: /Food/ }),
		).toBeInTheDocument();

		// Food (folder 1) merges its leaves {5, 6} — not the id 1 itself, and not
		// Home's leaf 7.
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5, 6] }),
		);
		expect(countMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5, 6] }),
		);
	});

	it("carries the account filter from the URL into both queries", async () => {
		await renderView("/categories/5?accountId=1");

		expect(await screen.findByText("Carrefour")).toBeInTheDocument();
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5], accountId: 1 }),
		);
		expect(countMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5], accountId: 1 }),
		);
	});

	it("shows a not-found state for an unknown category id", async () => {
		await renderView("/categories/999");

		expect(await screen.findByText(/category not found/i)).toBeInTheDocument();
		// An empty set never fetches (the query is disabled), so no rows show.
		expect(screen.queryByText("Carrefour")).not.toBeInTheDocument();
	});
});
