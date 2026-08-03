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
import { validateTransactionsSearch } from "./search";
import { TransactionsView } from "./transactions-view";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [
	{ id: 1, name: "Checking", type: "checking" },
	{ id: 2, name: "Savings", type: "savings" },
];

const ISSUERS = [{ id: 10, name: "Spotify" }];

const CATEGORIES = [
	{ id: 1, name: "Life", slug: "life", parentId: null, sortOrder: 0 },
	{ id: 5, name: "Subscriptions", slug: "subs", parentId: 1, sortOrder: 0 },
];

const TXNS = [
	{
		id: 100,
		accountId: 1,
		date: new Date("2026-01-20T00:00:00Z"),
		amount: -9.99,
		rawIssuerString: "SPOTIFY P2A34",
		issuerId: 10,
		// Derived through the issuer's default (the API computes this) → the leaf.
		categoryId: 5,
		importedAt: new Date(),
		importMonth: "2026-01",
	},
	{
		id: 101,
		accountId: 1,
		date: new Date("2026-02-01T00:00:00Z"),
		amount: 2500,
		rawIssuerString: "ACME PAYROLL",
		importedAt: new Date(),
		importMonth: "2026-02",
	},
];

// ---- SDK seam mock ----------------------------------------------------------

/**
 * The `total` the mocked list envelope reports. Defaults to the canned rows;
 * a pagination test raises it so there is more than one page to move between.
 */
let listTotal = TXNS.length;

/**
 * The rows the mocked list hands back. Defaults to the canned pair; a test that
 * needs a differently-shaped row (an **excluded from recap** one, say) swaps
 * this before rendering rather than growing `TXNS` — a third permanent row would
 * duplicate the issuer/category text every other test looks up by name.
 */
let listRows: Array<Record<string, unknown>> = TXNS;

const listMock = vi.fn((params: Record<string, unknown>) => ({
	queryKey: ["transactions", "list", params],
	queryFn: async () => ({ items: listRows, total: listTotal }),
}));

/**
 * The issuer *list* read, standing in for a table whose ids have outrun its
 * first page: it reports 500 issuers and hands back none of them. Any surface
 * that still named its rows from a list read would render them unresolved here —
 * which is exactly what #62 is about. Resolution must go through `byIds`.
 */
const issuerListMock = vi.fn(() => ({
	queryKey: ["issuers", "list"],
	queryFn: async () => ({ items: [] as typeof ISSUERS, total: 500 }),
}));

/** The by-ids read — answers with exactly the issuers asked for, and no others. */
const issuerByIdsMock = vi.fn((ids: Iterable<number>) => {
	const wanted = [...new Set(ids)].sort((a, b) => a - b);
	return {
		queryKey: ["issuers", "by-ids", wanted],
		queryFn: async () => {
			const items = ISSUERS.filter((i) => wanted.includes(i.id));
			return { items, total: items.length };
		},
	};
});

vi.mock("@mamen/sdk", () => ({
	transactionQueries: {
		list: (p: Record<string, unknown> = {}) => listMock(p),
	},
	accountQueries: {
		list: () => ({
			queryKey: ["accounts", "list"],
			queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
		}),
	},
	issuerQueries: {
		list: () => issuerListMock(),
		all: () => issuerListMock(),
		byIds: (ids: Iterable<number>) => issuerByIdsMock(ids),
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

function makeRouter(initialEntry = "/transactions") {
	const rootRoute = createRootRoute();
	const txRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions",
		validateSearch: validateTransactionsSearch,
		component: TransactionsView,
	});
	// A stub for the detail route so row-click navigation has somewhere to land;
	// the real page's queries aren't exercised here — only that the URL changes.
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions/$transactionId",
		component: () => <div>Detail stub</div>,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([txRoute, detailRoute]),
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
}

async function renderView(initialEntry = "/transactions") {
	const router = makeRouter(initialEntry);
	render(<RouterProvider router={router} />);
	// Wait for the table to render (the unresolved row's assignment button) so the
	// sort header and rows exist before a test interacts with them. Scoped by role
	// because the raw string also appears verbatim in the Raw issuer column.
	await screen.findByRole("button", { name: /ACME PAYROLL/ });
	return router;
}

beforeEach(() => {
	listMock.mockClear();
	issuerByIdsMock.mockClear();
	listRows = TXNS;
	listTotal = TXNS.length;
});

describe("TransactionsView", () => {
	it("renders the table with newest-first data and signed, colored amounts", async () => {
		await renderView();

		// Resolved row (issuerId 10) → the Issuer cell shows the issuer name, not the
		// raw string; unresolved row (no issuerId) → raw counterparty text. Both are
		// buttons (the curation surfaces), which is what distinguishes them from the
		// Raw issuer column, where every row's raw string is shown verbatim as text.
		expect(screen.getByRole("button", { name: /Spotify/ })).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /SPOTIFY P2A34/ }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /ACME PAYROLL/ }),
		).toBeInTheDocument();
		// Raw issuer column: the unparsed bank label for every row, resolved or not.
		expect(screen.getByText("SPOTIFY P2A34")).toBeInTheDocument();
		// Account column resolves the id to a name.
		expect(screen.getAllByText("Checking").length).toBeGreaterThan(0);

		// Debit is red (high) and negative; credit is green (low) and positive.
		const debit = screen.getByText(/9,99/);
		expect(debit).toHaveClass("text-gousse-high");
		const credit = screen.getByText(/2\s?500/);
		expect(credit).toHaveClass("text-gousse-low");

		// Default sort is desc, so `list` is called with orderBy date / desc.
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: "date",
				direction: "desc",
				offset: 0,
			}),
		);
	});

	// The regression #62 exists for: an issuer whose id sorts outside the issuer
	// list's first page still names its rows, because the table asks for the ids
	// it is showing rather than reading the table and hoping.
	it("resolves an issuer the list read would have missed", async () => {
		await renderView();

		expect(screen.getByRole("button", { name: /Spotify/ })).toBeInTheDocument();
		// Only the ids actually on screen are asked for — the unmatched row
		// contributes none, so this is one id, not the whole issuer table.
		expect(issuerByIdsMock).toHaveBeenCalled();
		for (const [ids] of issuerByIdsMock.mock.calls) {
			expect([...ids].every((id) => id === 10)).toBe(true);
		}
		expect(
			issuerByIdsMock.mock.calls.some(([ids]) => [...ids].includes(10)),
		).toBe(true);
	});

	it("shows the derived category leaf name, and Unassigned when none", async () => {
		await renderView();

		// The Category column sits between Issuer and Amount; Notes is last.
		const headers = screen
			.getAllByRole("columnheader")
			.map((h) => h.textContent);
		expect(headers).toEqual([
			"Date",
			"Account",
			"Issuer",
			"Raw issuer",
			"Category",
			"Amount",
			// Screen-reader-only header for the transfer-badge column (PRD #48).
			"Transfer",
			"Notes",
		]);

		// Row with a derived categoryId → its leaf name, plain (no folder path).
		expect(screen.getByText("Subscriptions")).toBeInTheDocument();
		expect(screen.queryByText(/Life/)).not.toBeInTheDocument();
		// Row with no derived category → Unassigned.
		expect(screen.getByText("Unassigned")).toBeInTheDocument();
	});

	it("writes accountId to the URL and calls list with that filter", async () => {
		const router = await renderView();
		const user = userEvent.setup();

		await user.selectOptions(screen.getByLabelText("Filter by account"), "1");

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ accountId: 1 });
		});
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 1, offset: 0 }),
		);
	});

	it("combines account and month filters (AND) in the URL and query", async () => {
		const router = await renderView();
		const user = userEvent.setup();

		await user.selectOptions(screen.getByLabelText("Filter by account"), "1");
		await user.selectOptions(
			screen.getByLabelText("Filter by month"),
			"2026-01",
		);

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({
				accountId: 1,
				importMonth: "2026-01",
			});
		});
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 1, importMonth: "2026-01" }),
		);
	});

	// **Excluded from recap** (issue #67): the filter is a three-way select, and
	// both halves reach the query — the list is where the user goes to see what
	// they have held out of their totals.
	it("filters by recap exclusion state, in the URL and the query", async () => {
		const router = await renderView();
		const user = userEvent.setup();

		await user.selectOptions(
			screen.getByLabelText("Filter by recap exclusion"),
			"excluded",
		);

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({
				excludedFromRecap: true,
			});
		});
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ excludedFromRecap: true, offset: 0 }),
		);

		// The other half is a filter too, not the absence of one.
		await user.selectOptions(
			screen.getByLabelText("Filter by recap exclusion"),
			"counted",
		);
		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({
				excludedFromRecap: false,
			});
		});
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ excludedFromRecap: false }),
		);
	});

	// An excluded row stays fully visible — exclusion is about arithmetic, not
	// visibility — so it must be legible *as* excluded at a glance (issue #67).
	it("paints an excluded row in its own colour, distinct from the uncurated tint", async () => {
		listRows = [{ ...TXNS[0], excludedFromRecap: true }, TXNS[1]];
		await renderView();

		const excludedRow = screen.getByText("SPOTIFY P2A34").closest("tr");
		expect(excludedRow).toHaveAttribute("data-excluded", "true");
		expect(excludedRow?.className).toContain("bg-gousse-muted");
		// The uncurated (red) tint is a different state and must not double up.
		expect(excludedRow?.className).not.toContain("bg-gousse-high");

		// The unexcluded row carries neither marker.
		const countedRow = screen.getAllByText("ACME PAYROLL")[0].closest("tr");
		expect(countedRow).not.toHaveAttribute("data-excluded");
	});

	// Exclusion is derived through the issuer (issue #69, ADR 0008), so the wire
	// hands the table one answer whatever its source: a row excluded because its
	// issuer is (no `manualExcluded`) and one the user flagged by hand must be
	// indistinguishable here. Anything else would make the table re-implement the
	// derivation — the drift ADR 0002 exists to stop.
	it("paints an inherited exclusion exactly like a hand-flagged one", async () => {
		listRows = [
			// Inherited: the row carries no manual flag of its own.
			{ ...TXNS[0], excludedFromRecap: true },
			{ ...TXNS[1], excludedFromRecap: true, manualExcluded: true },
		];
		await renderView();

		const inherited = screen.getByText("SPOTIFY P2A34").closest("tr");
		const manual = screen.getAllByText("ACME PAYROLL")[0].closest("tr");
		expect(inherited).toHaveAttribute("data-excluded", "true");
		expect(manual).toHaveAttribute("data-excluded", "true");
		expect(inherited?.className).toContain("bg-gousse-muted");
		expect(manual?.className).toContain("bg-gousse-muted");
	});

	// An excluded row that is *also* bare would otherwise carry two washes; the
	// exclusion is the stronger statement, so it wins (ADR 0008).
	it("prefers the exclusion colour over the uncurated tint on a bare row", async () => {
		listRows = [{ ...TXNS[1], excludedFromRecap: true }];
		await renderView();

		const row = screen.getAllByText("ACME PAYROLL")[0].closest("tr");
		expect(row).toHaveAttribute("data-excluded", "true");
		expect(row?.className).not.toContain("bg-gousse-high");
	});

	it("clears filters back to the full history", async () => {
		const router = await renderView(
			"/transactions?accountId=1&importMonth=2026-01",
		);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /clear/i }));

		await waitFor(() => {
			expect(router.state.location.search).not.toMatchObject({ accountId: 1 });
		});
		expect(router.state.location.search).not.toHaveProperty("accountId");
		expect(router.state.location.search).not.toHaveProperty("importMonth");
	});

	it("toggles the date sort direction in the URL", async () => {
		const router = await renderView();
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /sort by date/i }));

		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ direction: "asc" });
		});
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ direction: "asc" }),
		);
	});

	it("reproduces a bookmarked filtered view from the URL on load", async () => {
		await renderView("/transactions?accountId=2&importMonth=2026-02");

		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 2, importMonth: "2026-02" }),
		);
	});

	it("navigates to the transaction detail page when a row is clicked", async () => {
		const router = await renderView();
		const user = userEvent.setup();

		// Click the row's Date cell (a non-curation cell) — the whole row is the
		// navigation surface. "01 Feb 2026" is the date of TXN 101.
		await user.click(screen.getByText("01 Feb 2026"));

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/transactions/101");
		});
	});

	it("does not navigate when a curation cell (issuer/category/notes) is clicked", async () => {
		const router = await renderView();
		const user = userEvent.setup();

		// The Category cell opens the override picker; its click must not bubble to
		// the row's navigation handler, so the URL stays on the list.
		await user.click(screen.getByText("Subscriptions"));
		expect(router.state.location.pathname).toBe("/transactions");

		// Same for the Issuer cell.
		await user.click(screen.getByText("Spotify"));
		expect(router.state.location.pathname).toBe("/transactions");

		// And the empty Notes cell ("Add note").
		await user.click(screen.getAllByText("Add note")[0]);
		expect(router.state.location.pathname).toBe("/transactions");
	});

	it("puts the page number — not the row offset — in the URL", async () => {
		listTotal = 120;
		const router = await renderView();
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /next/i }));

		// The URL carries the human-readable page; the SDK still gets the offset it
		// multiplies out to.
		await waitFor(() => {
			expect(router.state.location.search).toMatchObject({ page: 2 });
		});
		expect(router.state.location.search).not.toHaveProperty("offset");
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ offset: 50, limit: 50 }),
		);
	});

	it("restores the page from a bookmarked ?page= URL", async () => {
		listTotal = 120;
		await renderView("/transactions?page=3");

		expect(screen.getByLabelText("Pagination range")).toHaveTextContent(
			"Page 3 of 3",
		);
		// Page 3 at 50/page starts at row 100.
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({ offset: 100 }),
		);
	});

	it("returns to the exact page it left when history goes back", async () => {
		listTotal = 120;
		const router = await renderView();
		const user = userEvent.setup();

		// Walk to page 3, then drill into a row.
		await user.click(screen.getByRole("button", { name: /next/i }));
		await waitFor(() =>
			expect(router.state.location.search).toMatchObject({ page: 2 }),
		);
		await user.click(screen.getByRole("button", { name: /next/i }));
		await waitFor(() =>
			expect(router.state.location.search).toMatchObject({ page: 3 }),
		);

		await user.click(screen.getByText("SPOTIFY P2A34"));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/transactions/100"),
		);

		// Back lands on page 3 again — not page 1, which a fresh link would give.
		router.history.back();
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/transactions");
			expect(router.state.location.search).toMatchObject({ page: 3 });
		});
	});
});
