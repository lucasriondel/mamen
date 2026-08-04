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
import { validateRecapSearch } from "../search";
import { RecapDetailView } from "./recap-detail-view";
import { validateRecapDetailSearch } from "./search";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [
	{ id: 1, name: "Checking", type: "checking" },
	{ id: 2, name: "Savings", type: "savings" },
];
const ISSUERS = [{ id: 10, name: "Carrefour" }];
const CATEGORIES = [
	{
		id: 100,
		name: "Groceries",
		slug: "groceries",
		parentId: null,
		sortOrder: 0,
	},
];

const TXNS = [
	{
		id: 500,
		accountId: 1,
		date: new Date("2026-07-20T00:00:00Z"),
		amount: -42.5,
		rawIssuerString: "CARREFOUR 12",
		issuerId: 10,
		categoryId: 100,
		importedAt: new Date(),
		importMonth: "2026-07",
	},
];

// ---- SDK seam mock ----------------------------------------------------------

const listMock = vi.fn((params: Record<string, unknown>) => ({
	queryKey: ["transactions", "list", params],
	queryFn: async () => ({ items: TXNS, total: TXNS.length }),
}));

const countMock = vi.fn((params: Record<string, unknown>) => ({
	queryKey: ["transactions", "count", params],
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
		searchByName: (term: string) => ({
			queryKey: ["issuers", "search", term.trim()],
			queryFn: async () => {
				const items = ISSUERS.filter((i) =>
					i.name.toLowerCase().includes(term.trim().toLowerCase()),
				);
				return { items, total: items.length };
			},
		}),
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
	// The recap route is registered too, so the header's "← Recap" link resolves.
	const recapRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/recap",
		validateSearch: validateRecapSearch,
		component: () => <p>recap page</p>,
	});
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/recap-detail",
		validateSearch: validateRecapDetailSearch,
		component: RecapDetailView,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([recapRoute, detailRoute]),
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
}

function renderView(initialEntry: string) {
	const router = makeRouter(initialEntry);
	render(<RouterProvider router={router} />);
	return router;
}

beforeEach(() => {
	listMock.mockClear();
	countMock.mockClear();
});

/**
 * The params of the **paged** list call — the rows on screen. The section also
 * fires a wide month-scan (`limit: 1000`, the scope but none of the user's
 * filters) to build the month picker's options, so the last call is not
 * necessarily the one the table renders.
 */
function pagedListParams(): Record<string, unknown> {
	const call = listMock.mock.calls
		.map(([params]) => params)
		.findLast((params) => params.orderBy === "date");
	if (call === undefined) throw new Error("no paged list call was made");
	return call;
}

describe("RecapDetailView", () => {
	it("lists an issuer bucket's transactions over the recap's period", async () => {
		renderView(
			"/recap-detail?by=issuer&bucket=10&period=month&month=2026-07&excludedFromRecap=false",
		);

		expect(
			await screen.findByRole("heading", { name: /Carrefour/ }),
		).toBeInTheDocument();

		// The rows and the header total are driven by ONE filter object: the bucket,
		// the period as inclusive `date` bounds, and the counted-only recap filter.
		const expected = {
			issuerId: 10,
			excludedFromRecap: false,
			startDate: new Date("2026-07-01T00:00:00.000Z"),
			endDate: new Date("2026-07-31T23:59:59.999Z"),
		};
		expect(listMock).toHaveBeenCalledWith(expect.objectContaining(expected));
		expect(countMock).toHaveBeenCalledWith(expect.objectContaining(expected));

		await waitFor(() =>
			expect(screen.getByLabelText("Detail total")).toHaveTextContent(/-42,50/),
		);
		// The shared transactions table renders the row — the issuer's name is now on
		// screen twice: once in the header, once on its transaction.
		expect(screen.getAllByText("Carrefour").length).toBeGreaterThan(1);
	});

	it("lists a category bucket, matching the derived category", async () => {
		renderView("/recap-detail?by=category&bucket=100&period=year&year=2026");

		expect(
			await screen.findByRole("heading", { name: /Groceries/ }),
		).toBeInTheDocument();
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({
				categoryId: 100,
				startDate: new Date("2026-01-01T00:00:00.000Z"),
				endDate: new Date("2026-12-31T23:59:59.999Z"),
			}),
		);
	});

	// The recap's biggest row on a fresh import. It must ask for the rows that HAVE
	// no issuer — dropping the filter would show the whole table under its header.
	it("drills into the Unassigned bucket by asking for the rows with none", async () => {
		renderView("/recap-detail?by=issuer&bucket=none&period=all");

		expect(
			await screen.findByRole("heading", { name: /Unassigned/ }),
		).toBeInTheDocument();
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ issuerId: "none" }),
		);
		expect(pagedListParams()).not.toHaveProperty("startDate");
	});

	// The recap's picker is multi-select, so the whole selection must ride along —
	// otherwise the page's total describes accounts the row never counted.
	it("carries a multi-account selection into both queries", async () => {
		renderView(
			"/recap-detail?by=issuer&bucket=10&period=all&accountIds=1&accountIds=2",
		);

		await screen.findByRole("heading", { name: /Carrefour/ });
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: [1, 2] }),
		);
		expect(countMock).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: [1, 2] }),
		);
	});

	it("states its pinned scope — the axis, the period and the accounts", async () => {
		renderView(
			"/recap-detail?by=issuer&bucket=10&period=month&month=2026-07&accountIds=2",
		);

		await screen.findByRole("heading", { name: /Carrefour/ });
		expect(await screen.findByText(/Issuer ·/)).toHaveTextContent("Savings");
	});

	it("keeps the user's filters on top of the pinned scope", async () => {
		renderView(
			"/recap-detail?by=issuer&bucket=10&period=all&search=carrefour&excludedFromRecap=true",
		);

		await screen.findByRole("heading", { name: /Carrefour/ });
		// The term narrows the rows *and* the header total, and the widened recap
		// filter reaches the query as `true` rather than being read as "no filter".
		const expected = {
			issuerId: 10,
			search: "carrefour",
			excludedFromRecap: true,
		};
		expect(listMock).toHaveBeenCalledWith(expect.objectContaining(expected));
		expect(countMock).toHaveBeenCalledWith(expect.objectContaining(expected));
	});

	it("writes a filter change to the URL and resets the page", async () => {
		const user = userEvent.setup();
		const router = renderView(
			"/recap-detail?by=issuer&bucket=10&period=all&page=3",
		);

		await user.type(
			await screen.findByLabelText("Search transactions"),
			"carrefour",
		);

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({
				search: "carrefour",
				page: 1,
				// The target and the pinned scope survive the write.
				by: "issuer",
				bucket: 10,
			});
		});
	});

	it("returns to the recap on the very period and accounts it came from", async () => {
		const user = userEvent.setup();
		const router = renderView(
			"/recap-detail?by=issuer&bucket=10&period=month&month=2026-07&accountIds=2",
		);

		await user.click(await screen.findByRole("link", { name: /Recap/ }));

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/recap");
			expect(router.state.location.search).toMatchObject({
				period: "month",
				month: "2026-07",
				accountIds: [2],
			});
		});
	});

	// The other line the recap can open (issue #87): the rows held out of the
	// totals, which have no issuer or category scope because they are the
	// complement of the spend rather than a slice of it.
	describe("the excluded view (issue #87)", () => {
		it("lists the rows held out, with no issuer or category scope", async () => {
			renderView(
				"/recap-detail?excluded=true&period=month&month=2026-07&excludedFromRecap=true",
			);

			expect(
				await screen.findByRole("heading", { name: /Excluded from recap/ }),
			).toBeInTheDocument();

			// The paged list call, not the month-scan the filter bar's options come
			// from (which is scoped but carries no user filters).
			const params = pagedListParams();
			expect(params).toMatchObject({
				excludedFromRecap: true,
				startDate: new Date("2026-07-01T00:00:00.000Z"),
				endDate: new Date("2026-07-31T23:59:59.999Z"),
			});
			expect(params).not.toHaveProperty("issuerId");
			expect(params).not.toHaveProperty("categoryId");
		});

		it("says why its rows are here rather than naming an entity kind", async () => {
			renderView("/recap-detail?excluded=true&period=all&accountIds=2");

			await screen.findByRole("heading", { name: /Excluded from recap/ });
			// The accounts read resolves a beat after the header renders.
			await waitFor(() =>
				expect(screen.getByText(/Held out of the recap/)).toHaveTextContent(
					"Savings",
				),
			);
		});

		// The excluded rows are not a slice of a bucket — asking for "this issuer's
		// excluded rows" is the filter bar's job, so the excluded view wins here.
		it("stays the excluded view even if a bucket rides in the same URL", async () => {
			renderView("/recap-detail?excluded=true&by=issuer&bucket=10&period=all");

			expect(
				await screen.findByRole("heading", { name: /Excluded from recap/ }),
			).toBeInTheDocument();
			expect(pagedListParams()).not.toHaveProperty("issuerId");
		});

		it("carries the recap's account selection like a bucket page does", async () => {
			renderView(
				"/recap-detail?excluded=true&period=all&accountIds=1&accountIds=2&excludedFromRecap=true",
			);

			await screen.findByRole("heading", { name: /Excluded from recap/ });
			expect(listMock).toHaveBeenCalledWith(
				expect.objectContaining({ accountId: [1, 2] }),
			);
			expect(countMock).toHaveBeenCalledWith(
				expect.objectContaining({ accountId: [1, 2] }),
			);
		});
	});

	// Only reachable by hand-editing the URL. Querying unscoped would show the whole
	// table under a header claiming to be one bucket.
	it("shows an empty state and never queries when the URL names no bucket", async () => {
		renderView("/recap-detail?period=all");

		expect(await screen.findByText(/nothing to show/i)).toBeInTheDocument();
		expect(listMock).not.toHaveBeenCalled();
		expect(screen.queryByText("Carrefour")).not.toBeInTheDocument();
	});
});
