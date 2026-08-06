import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateTransactionsSearch } from "../transactions/search";
import { CategoryTransactionsView } from "./category-transactions-view";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [{ id: 1, name: "Checking", type: "checking" }];
const ISSUERS = [{ id: 10, name: "Carrefour" }];

// Food (folder 1) → Groceries (leaf 5), Restaurants (leaf 6); Home (folder 2) →
// Rent (leaf 7), Utilities (folder 8) → Electricity (leaf 9). So a folder page
// (id 1) merges {5, 6}; a leaf page (id 5) is {5}; the deep folder page (id 2)
// descends past Utilities to the depth-3 leaf and merges {7, 9}.
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
	{ id: 8, name: "Utilities", slug: "utilities", parentId: 2, sortOrder: 1 },
	{
		id: 9,
		name: "Electricity",
		slug: "electricity",
		parentId: 8,
		sortOrder: 0,
	},
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
		// The shared transfer-suggestion read (issue #91) — every transactions table
		// asks for it to mark its rows. Nothing here is a candidate.
		transferCandidates: () => ({
			queryKey: ["transactions", "transfer-candidates"],
			queryFn: async () => [],
		}),
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
		// The picker read: a name search over the whole set, like the server (#79).
		searchByName: (term: string) => ({
			queryKey: ["issuers", "search", term.trim()],
			queryFn: async () => {
				const items = ISSUERS.filter((i) =>
					i.name.toLowerCase().includes(term.trim().toLowerCase()),
				);
				return { items, total: items.length };
			},
		}),
		// The resolution read: exactly the ids asked for, nothing else (#62).
		byIds: (ids: Iterable<number>) => {
			const wanted = [...new Set(ids)].sort((a, b) => a - b);
			return {
				queryKey: ["issuers", "by-ids", wanted],
				queryFn: async () => {
					const items = ISSUERS.filter((i) => wanted.includes(i.id));
					return { items, total: items.length };
				},
			};
		},
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

	it("a folder page descends its whole subtree to a leaf at any depth", async () => {
		await renderView("/categories/2");

		expect(
			await screen.findByRole("heading", { name: /Home/ }),
		).toBeInTheDocument();

		// Home (folder 2) rolls up its direct leaf Rent (7) and, past the
		// Utilities sub-folder (8), the depth-3 leaf Electricity (9) — one merged
		// set, one query, with the money at depth 3 not understated. The mid-tier
		// folder id (8) is never in the set.
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [7, 9] }),
		);
		expect(countMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [7, 9] }),
		);
	});

	it("carries the account filter from the URL into both queries", async () => {
		await renderView("/categories/5?accountId=1");

		expect(await screen.findByText("Carrefour")).toBeInTheDocument();
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5], accountId: [1] }),
		);
		expect(countMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5], accountId: [1] }),
		);
	});

	it("carries the search term from the URL into both queries", async () => {
		await renderView("/categories/5?search=carrefour");

		expect(await screen.findByText("Carrefour")).toBeInTheDocument();
		// The term narrows the rows *and* the header total, so the number can't
		// describe a wider set than the list beneath it.
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5], search: "carrefour" }),
		);
		expect(countMock).toHaveBeenCalledWith(
			expect.objectContaining({ categoryId: [5], search: "carrefour" }),
		);
	});

	it("typing in the search box writes the term to the URL", async () => {
		const user = userEvent.setup();
		const router = await renderView("/categories/5");

		await user.type(
			await screen.findByLabelText("Search transactions"),
			"carrefour",
		);

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({
				search: "carrefour",
			});
		});
	});

	it("shows a not-found state for an unknown category id", async () => {
		await renderView("/categories/999");

		expect(await screen.findByText(/category not found/i)).toBeInTheDocument();
		// An empty set never fetches (the query is disabled), so no rows show.
		expect(screen.queryByText("Carrefour")).not.toBeInTheDocument();
	});
});
