import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateTransactionsSearch } from "./search";
import { TransactionsView } from "./transactions-view";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [
	{ id: 1, name: "Checking", type: "checking" },
	{ id: 2, name: "Savings", type: "savings" },
];

// Issuer 11 is named by a **bundle member** only — no top-level row points at
// it, so it is resolvable only if members are part of what the page asks for.
const ISSUERS = [
	{ id: 10, name: "Spotify" },
	{ id: 11, name: "Alan" },
];

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

/**
 * A **bundle parent** and the two **bundle members** it stands for (issue #73):
 * 200 € of groceries against 150 € paid back is one 50 € weekend. The members
 * are hidden from the top level by the server, so they arrive in the list
 * envelope's own `bundleMembers` field rather than among `items`.
 */
const BUNDLE_PARENT = {
	id: 200,
	accountId: 1,
	date: new Date("2026-03-07T00:00:00Z"),
	amount: -50,
	rawIssuerString: "Weekend away",
	kind: "bundle",
	importedAt: new Date(),
	importMonth: "2026-03",
};

const BUNDLE_MEMBERS = [
	{
		id: 201,
		accountId: 1,
		date: new Date("2026-03-07T00:00:00Z"),
		amount: -200,
		rawIssuerString: "GROCERIES",
		bundleId: 200,
		importedAt: new Date(),
		importMonth: "2026-03",
	},
	{
		id: 202,
		accountId: 1,
		date: new Date("2026-03-12T00:00:00Z"),
		amount: 150,
		rawIssuerString: "REVOLUT LUCAS",
		// Matched to an issuer no top-level row names (see ISSUERS).
		issuerId: 11,
		bundleId: 200,
		importedAt: new Date(),
		importMonth: "2026-03",
	},
];

/**
 * A **transfer suggestion** (issue #91): 500 € leaving Checking, and two credits
 * of the same amount in Savings that might be its other half. One debit, two
 * candidates, ONE decision — the shape the grouped payload exists for.
 */
const TRANSFER_DEBIT = {
	id: 300,
	accountId: 1,
	date: new Date("2026-04-01T00:00:00Z"),
	amount: -500,
	rawIssuerString: "VIR SEPA VERS LIVRET A",
	importedAt: new Date(),
	importMonth: "2026-04",
};

const TRANSFER_CREDIT_NEAR = {
	id: 301,
	accountId: 2,
	date: new Date("2026-04-02T00:00:00Z"),
	amount: 500,
	rawIssuerString: "VIREMENT RECU LUCAS",
	importedAt: new Date(),
	importMonth: "2026-04",
};

const TRANSFER_CREDIT_FAR = {
	id: 302,
	accountId: 2,
	date: new Date("2026-04-04T00:00:00Z"),
	amount: 500,
	rawIssuerString: "VIREMENT DIVERS",
	importedAt: new Date(),
	importMonth: "2026-04",
};

/**
 * The grouped candidate payload, as the server orients it: `leg` is always the
 * debit, counterparts closest-date first. The credit rows appear only *inside*
 * it — the client is what indexes them back the other way so they get an
 * indicator too.
 */
const TRANSFER_CANDIDATES = [
	{
		leg: TRANSFER_DEBIT,
		counterparts: [
			{ transaction: TRANSFER_CREDIT_NEAR, daysApart: 1 },
			{ transaction: TRANSFER_CREDIT_FAR, daysApart: 3 },
		],
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

/**
 * The **bundle members** the mocked envelope ships beside the page (issue #73) —
 * the rows a **bundle parent** on screen stands for. Empty for every test that
 * shows no parent, which is what the server sends for such a page.
 */
let listMembers: Array<Record<string, unknown>> = [];

const listMock = vi.fn((params: Record<string, unknown>) => ({
	queryKey: ["transactions", "list", params],
	queryFn: async () => ({
		items: listRows,
		total: listTotal,
		bundleMembers: listMembers,
	}),
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

/**
 * The **name search** — the picker read (#79). Matches a case-insensitive name
 * substring over the whole set, like the server, so a picker never needs the
 * list read above.
 */
const issuerSearchMock = vi.fn((term: string) => ({
	queryKey: ["issuers", "search", term.trim()],
	queryFn: async () => {
		const items = ISSUERS.filter((i) =>
			i.name.toLowerCase().includes(term.trim().toLowerCase()),
		);
		return { items, total: items.length };
	},
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

/**
 * The **transfer candidates** the mocked read hands back — one shared entry for
 * the whole dataset (issue #91). Empty for every test that isn't about
 * suggestions, which is what a table of ordinary rows gets.
 */
let candidateRows: Array<Record<string, unknown>> = [];

const candidatesMock = vi.fn(() => ({
	queryKey: ["transactions", "transfer-candidates"],
	queryFn: async () => candidateRows,
}));

vi.mock("@mamen/sdk", () => ({
	transactionQueries: {
		list: (p: Record<string, unknown> = {}) => listMock(p),
		transferCandidates: () => candidatesMock(),
	},
	accountQueries: {
		list: () => ({
			queryKey: ["accounts", "list"],
			queryFn: async () => ({ items: ACCOUNTS, total: ACCOUNTS.length }),
		}),
	},
	issuerQueries: {
		list: () => issuerListMock(),
		searchByName: (term: string) => issuerSearchMock(term),
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
	ruleKeys: {},
	transactionKeys: {},
	// The one write this view makes on its own (issue #86): the selection's
	// **bulk delete**. Everything else here is a read.
	transactionMutations: {
		bulkDelete: (ids: unknown) => bulkDeleteMock(ids),
		linkTransfer: (ids: unknown) => linkTransferMock(ids),
		dismissTransferPairs: (pairs: unknown) => dismissPairsMock(pairs),
	},
}));

const bulkDeleteMock = vi.fn(async (_ids: unknown) => ({ count: 1 }));
const linkTransferMock = vi.fn(async (_ids: unknown) => ({ count: 2 }));
const dismissPairsMock = vi.fn(async (_pairs: unknown) => ({ count: 1 }));

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
	bulkDeleteMock.mockClear();
	linkTransferMock.mockClear();
	dismissPairsMock.mockClear();
	listRows = TXNS;
	listTotal = TXNS.length;
	listMembers = [];
	candidateRows = [];
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
			// The selection column (issue #68) leads and carries no text: its header
			// is the select-all checkbox, named for assistive tech by `aria-label`.
			"",
			// Screen-reader-only header for the bundle expand column (issue #73).
			"Expand",
			"Date",
			"Account",
			"Issuer",
			"Raw issuer",
			"Category",
			"Amount",
			// Screen-reader-only header for the transfer-badge column (PRD #48).
			"Transfer",
			// The per-row recap-exclusion checkbox (issues #67/#69, ADR 0008).
			"Excluded",
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

	// The month options are minted from the same field the filter now matches
	// (issue #87): the row's own `date`. Derived from the import stamp instead,
	// a row whose date moved after import would be unreachable — the dropdown
	// would offer the month it was filed under, and picking that month would
	// return everything except it.
	it("offers months derived from the rows' dates, not their import stamp", async () => {
		listRows = [
			...TXNS,
			// Filed with the March statement, dated in April: the statement that runs
			// from day 5 of one month to day 6 of the next (epic #85).
			{
				...TXNS[1],
				id: 102,
				rawIssuerString: "EDF",
				date: new Date("2026-04-02T00:00:00Z"),
				importMonth: "2026-03",
			},
		];
		listTotal = listRows.length;
		await renderView();

		const month = screen.getByLabelText("Filter by month");
		expect(
			within(month).getByRole("option", { name: "Apr 2026" }),
		).toBeInTheDocument();
		expect(
			within(month).queryByRole("option", { name: "Mar 2026" }),
		).toBeNull();
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

	// Selection is new to this table (issue #68): it exists so several rows can be
	// bundled into one. The checkbox lives inside a row whose every other cell
	// navigates, so it must not navigate — the same rule the curation cells follow.
	it("selects a row from its checkbox without navigating away", async () => {
		const router = await renderView();
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("checkbox", { name: /select transaction SPOTIFY/i }),
		);

		expect(router.state.location.pathname).toBe("/transactions");
		expect(
			screen.getByRole("checkbox", { name: /select transaction SPOTIFY/i }),
		).toBeChecked();
	});

	it("offers bundling only once a selection exists, and counts it", async () => {
		await renderView();
		const user = userEvent.setup();

		// Nothing selected → no action bar at all.
		expect(screen.queryByRole("button", { name: /create bundle/i })).toBeNull();

		await user.click(
			screen.getByRole("checkbox", { name: /select transaction SPOTIFY/i }),
		);
		expect(screen.getByText(/1 selected/i)).toBeVisible();
		// One row is not a bundle — the action stays out of reach until there are two.
		expect(
			screen.getByRole("button", { name: /create bundle/i }),
		).toBeDisabled();

		await user.click(
			screen.getByRole("checkbox", {
				name: /select transaction ACME PAYROLL/i,
			}),
		);
		expect(screen.getByText(/2 selected/i)).toBeVisible();
	});

	/**
	 * **Bulk delete** (issue #86), through the real table: the ids the dialog
	 * sends are the ids of the rows that were ticked, and the list re-reads on its
	 * own afterwards. Deleting is not recoverable, so it goes through a
	 * confirmation — and nothing is written until that confirmation is given.
	 */
	it("deletes the ticked rows once confirmed, and the list reflects it", async () => {
		await renderView();
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("checkbox", { name: /select transaction SPOTIFY/i }),
		);
		await user.click(screen.getByRole("button", { name: /^delete$/i }));
		expect(bulkDeleteMock).not.toHaveBeenCalled();

		// What the server holds once the row is gone — the invalidated list re-reads
		// it without anyone pressing anything.
		listRows = [TXNS[1]];
		listTotal = 1;

		await user.click(
			within(screen.getByRole("dialog")).getByRole("button", {
				name: /^delete 1 transaction$/i,
			}),
		);

		await waitFor(() => expect(bulkDeleteMock).toHaveBeenCalledWith([100]));
		await waitFor(() => expect(screen.queryByText("SPOTIFY P2A34")).toBeNull());
		// The selection went with the rows it named: the bar is gone.
		expect(screen.queryByText(/1 selected/i)).toBeNull();
	});

	it("selects and clears every row on the page from the header checkbox", async () => {
		await renderView();
		const user = userEvent.setup();

		const selectAll = screen.getByRole("checkbox", {
			name: /select all rows on this page/i,
		});
		await user.click(selectAll);
		expect(screen.getByText(/2 selected/i)).toBeVisible();

		await user.click(screen.getByRole("button", { name: /clear selection/i }));
		expect(screen.queryByText(/selected/i)).toBeNull();
		expect(selectAll).not.toBeChecked();
	});

	// **Bundle** expansion (issue #73). Members are hidden from the top level so
	// they are not counted twice, which is right for the totals and opaque for the
	// reader: a 50 € row labelled "Weekend away" says nothing about the 200 € debit
	// and the 150 € refund behind it. Expanding the parent shows them in place.
	describe("bundle expansion (issue #73)", () => {
		/** Render a page holding the bundle parent, its members riding alongside. */
		async function renderWithBundle() {
			listRows = [BUNDLE_PARENT, ...TXNS];
			listMembers = BUNDLE_MEMBERS;
			listTotal = listRows.length;
			return await renderView();
		}

		it("shows a parent's members only once it is expanded", async () => {
			await renderWithBundle();
			const user = userEvent.setup();

			// Collapsed: the parent is the only row standing for that money.
			expect(screen.getAllByText("Weekend away").length).toBeGreaterThan(0);
			expect(screen.queryAllByText("GROCERIES")).toEqual([]);
			expect(screen.queryAllByText("REVOLUT LUCAS")).toEqual([]);

			const toggle = screen.getByRole("button", {
				name: /show the 2 transactions in weekend away/i,
			});
			expect(toggle).toHaveAttribute("aria-expanded", "false");
			await user.click(toggle);

			expect(screen.getAllByText("GROCERIES").length).toBeGreaterThan(0);
			expect(screen.getAllByText("REVOLUT LUCAS").length).toBeGreaterThan(0);
			// The members arrive with the page — expanding asks the server nothing.
			expect(listMock.mock.calls.some(([params]) => "bundleId" in params)).toBe(
				false,
			);

			// And it closes again.
			await user.click(
				screen.getByRole("button", {
					name: /hide the 2 transactions in weekend away/i,
				}),
			);
			expect(screen.queryAllByText("GROCERIES")).toEqual([]);
		});

		// The row is a link to the detail page, so the one control inside it that
		// means something else must not also navigate — the rule the curation cells
		// and the selection checkbox already follow.
		it("expands without navigating to the parent's detail page", async () => {
			const router = await renderWithBundle();
			const user = userEvent.setup();

			await user.click(
				screen.getByRole("button", {
					name: /show the 2 transactions in weekend away/i,
				}),
			);

			expect(router.state.location.pathname).toBe("/transactions");
			expect(screen.getAllByText("GROCERIES").length).toBeGreaterThan(0);
		});

		// A member is a real bank row that has left the top level; it is shown for
		// reading, and the count beneath the table still describes the top level.
		it("shows members for reading, never as rows of the page", async () => {
			await renderWithBundle();
			const user = userEvent.setup();

			await user.click(
				screen.getByRole("button", {
					name: /show the 2 transactions in weekend away/i,
				}),
			);

			// A member is marked as one, and carries no selection checkbox: it is
			// already bundled, so ticking it could lead nowhere.
			const member = screen.getAllByText("GROCERIES")[0].closest("tr");
			expect(member).toHaveAttribute("data-bundle-member", "true");
			expect(
				screen.queryByRole("checkbox", {
					name: /select transaction GROCERIES/i,
				}),
			).toBeNull();

			// Select-all takes the page's rows — the three top-level ones — and no
			// member, so the bundle's money can't be re-bundled from under it.
			await user.click(
				screen.getByRole("checkbox", { name: /select all rows on this page/i }),
			);
			expect(screen.getByText(/3 selected/i)).toBeVisible();

			// The pagination still counts the top-level set only: 3 rows, not 5.
			expect(screen.getByLabelText("Pagination range")).toHaveTextContent(
				"1–3 of 3",
			);
		});

		// A member's issuer is resolved like any other row's (#62, one level down):
		// the ids the page asks for must include the members', or an expanded member
		// that matched perfectly renders as raw counterparty text under a parent
		// that resolves fine.
		it("resolves a member's issuer, not just the top-level rows'", async () => {
			await renderWithBundle();
			const user = userEvent.setup();

			await user.click(
				screen.getByRole("button", {
					name: /show the 2 transactions in weekend away/i,
				}),
			);

			// The member's issuer read went out with the member's id in it.
			await waitFor(() => {
				expect(
					issuerByIdsMock.mock.calls.some(([ids]) => [...ids].includes(11)),
				).toBe(true);
			});

			// And the Issuer cell names it, rather than falling back to raw text.
			const member = screen.getAllByText("REVOLUT LUCAS")[0].closest("tr");
			expect(await screen.findByText("Alan")).toBeVisible();
			expect(member).toHaveTextContent("Alan");
			// The unmatched sibling still reads as needing one.
			const unmatched = screen.getAllByText("GROCERIES")[0].closest("tr");
			expect(
				unmatched?.querySelector("[data-unresolved='true']"),
			).not.toBeNull();
		});

		// Three washes can apply to one row; the component settles the order rather
		// than leaving it to CSS. Exclusion (arithmetic) beats bundle (structure),
		// which beats uncurated (a to-do) — and they never stack.
		it("paints the parent as a bundle, under the exclusion colour", async () => {
			await renderWithBundle();

			const parent = screen.getAllByText("Weekend away")[0].closest("tr");
			expect(parent).toHaveAttribute("data-kind", "bundle");
			expect(parent?.className).toContain("bg-gousse-accent");
			// A fresh parent has no issuer, category or note, but it is not an
			// unreviewed import — the bundle wash replaces the uncurated tint.
			expect(parent?.className).not.toContain("bg-gousse-high");
		});

		it("lets the exclusion colour win over the bundle colour", async () => {
			listRows = [{ ...BUNDLE_PARENT, excludedFromRecap: true }];
			listMembers = BUNDLE_MEMBERS;
			listTotal = 1;
			const router = makeRouter();
			render(<RouterProvider router={router} />);
			await screen.findAllByText("Weekend away");

			const parent = screen.getAllByText("Weekend away")[0].closest("tr");
			expect(parent).toHaveAttribute("data-excluded", "true");
			expect(parent?.className).toContain("bg-gousse-muted");
			expect(parent?.className).not.toContain("bg-gousse-accent");
		});

		it("offers no expand affordance on an ordinary row", async () => {
			await renderView();

			expect(
				screen.queryByRole("button", { name: /show the .* in /i }),
			).toBeNull();
		});
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

/**
 * **Transfer suggestions in the table** (issue #91). A **transfer group** nets
 * out of the recap, so an unconfirmed internal transfer inflates both spend and
 * income by the same amount. Before this, the only place to confirm one was a
 * page the user had to remember existed; now the row itself says so, and the
 * pairing can be refused from where the user already is.
 */
describe("TransactionsView — transfer suggestions", () => {
	/** The three transfer rows plus one ordinary row `renderView` waits on. */
	function useTransferFixture() {
		listRows = [
			TRANSFER_DEBIT,
			TRANSFER_CREDIT_NEAR,
			TRANSFER_CREDIT_FAR,
			TXNS[1],
		];
		listTotal = 4;
		candidateRows = TRANSFER_CANDIDATES;
	}

	/**
	 * The debit row's indicator. Awaited: the candidate read lands a beat after
	 * the rows, so the marker appears on a later paint than the table.
	 */
	const debitIndicator = () =>
		screen.findByRole("button", {
			name: /2 possible transfer matches for VIR SEPA VERS LIVRET A/,
		});

	it("marks a debit row that has candidate counterparts", async () => {
		useTransferFixture();
		await renderView();

		expect(await debitIndicator()).toBeInTheDocument();
	});

	// The symmetric half (story 3): the payload only ever names a credit *inside*
	// a debit's group, so a savings account full of incoming transfers would be a
	// blank list of unmarked rows unless the client indexes it both ways.
	it("marks a credit row too, from the same payload", async () => {
		useTransferFixture();
		await renderView();

		expect(
			await screen.findByRole("button", {
				name: /1 possible transfer match for VIREMENT RECU LUCAS/,
			}),
		).toBeInTheDocument();
	});

	// A row the server judged ineligible never appears in the payload, so it never
	// gets an indicator — the client re-derives nothing. An ordinary unmatched row
	// is the same case.
	it("leaves a row with no candidates unmarked", async () => {
		useTransferFixture();
		await renderView();

		await debitIndicator();
		const acmeRow = screen.getAllByText("ACME PAYROLL")[0].closest("tr");
		expect(
			within(acmeRow as HTMLElement).queryByRole("button", {
				name: /possible transfer/,
			}),
		).toBeNull();
	});

	// A settled row reads as settled: the badge and the indicator share one
	// column, and a grouped row is ineligible so it can never be offered a pair.
	it("shows the transfer badge, not an indicator, on a grouped row", async () => {
		listRows = [{ ...TRANSFER_DEBIT, transferGroupId: 300 }, TXNS[1]];
		listTotal = 2;
		candidateRows = [];
		await renderView();

		expect(
			screen.getByTitle(/Part of an internal transfer/),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /possible transfer/ }),
		).toBeNull();
	});

	it("lists every counterpart with amount, date, account, raw label and gap", async () => {
		useTransferFixture();
		const user = userEvent.setup();
		await renderView();

		await user.click(await debitIndicator());
		await screen.findByText("Possible transfer");

		// The nearer candidate's own entry, found by the bank's raw label — the
		// field a user judges a transfer by, and the one the popover exists to show.
		const entry = screen
			.getAllByText("VIREMENT RECU LUCAS")
			.map((node) => node.closest("li"))
			.find((node): node is HTMLLIElement => node !== null) as HTMLElement;

		expect(within(entry).getByText(/500,00/)).toBeInTheDocument();
		// Date and account, together on one line.
		expect(within(entry).getByText(/2 Apr 2026.*Savings/)).toBeInTheDocument();
		// The day gap, which is why this candidate outranks the other.
		expect(within(entry).getByText("1 day apart")).toBeInTheDocument();
		expect(screen.getByText("3 days apart")).toBeInTheDocument();
	});

	it("orders counterparts closest-date first", async () => {
		useTransferFixture();
		const user = userEvent.setup();
		await renderView();

		await user.click(await debitIndicator());
		await screen.findByText("Possible transfer");
		const labels = screen
			.getAllByText(/VIREMENT (RECU LUCAS|DIVERS)/)
			// The panel's copies only — the Raw issuer column shows them too.
			.filter((node) => node.className.includes("font-mono"));
		expect(labels.map((node) => node.textContent)).toEqual([
			"VIREMENT RECU LUCAS",
			"VIREMENT DIVERS",
			// The table's own Raw issuer cells follow, in row order.
			"VIREMENT RECU LUCAS",
			"VIREMENT DIVERS",
		]);
	});

	it("confirms exactly the counterpart that was clicked", async () => {
		useTransferFixture();
		const user = userEvent.setup();
		await renderView();

		await user.click(await debitIndicator());
		const buttons = await screen.findAllByRole("button", {
			name: "Link as transfer",
		});
		// The second one — the *far* candidate — so a positional mistake shows.
		await user.click(buttons[1]);

		await waitFor(() =>
			expect(linkTransferMock).toHaveBeenCalledWith([
				TRANSFER_DEBIT.id,
				TRANSFER_CREDIT_FAR.id,
			]),
		);
		// And the panel closes, acknowledging the decision.
		await waitFor(() =>
			expect(screen.queryByText("Possible transfer")).toBeNull(),
		);
	});

	// A button's placement must not lie about its blast radius: dismissal is
	// group-level, so it is rendered ONCE, at the foot of the panel.
	it("renders one group-level dismiss, not one per counterpart", async () => {
		useTransferFixture();
		const user = userEvent.setup();
		await renderView();

		await user.click(await debitIndicator());
		await screen.findByText("Possible transfer");

		expect(
			screen.getAllByRole("button", { name: "Link as transfer" }),
		).toHaveLength(2);
		expect(
			screen.getAllByRole("button", { name: /Not a transfer/ }),
		).toHaveLength(1);
	});

	it("dismisses exactly the pairs the panel displayed, debit-first", async () => {
		useTransferFixture();
		const user = userEvent.setup();
		await renderView();

		await user.click(await debitIndicator());
		await user.click(
			await screen.findByRole("button", { name: /Not a transfer/ }),
		);

		await waitFor(() =>
			expect(dismissPairsMock).toHaveBeenCalledWith([
				{ debitId: TRANSFER_DEBIT.id, creditId: TRANSFER_CREDIT_NEAR.id },
				{ debitId: TRANSFER_DEBIT.id, creditId: TRANSFER_CREDIT_FAR.id },
			]),
		);
	});

	// Standing in a credit's panel, the same gesture clears that credit's pairs
	// with each listed debit — and normalises them debit-first, whichever side
	// the user happened to be on.
	it("normalises a credit's own dismissal to debit-first", async () => {
		useTransferFixture();
		const user = userEvent.setup();
		await renderView();

		await user.click(
			await screen.findByRole("button", {
				name: /1 possible transfer match for VIREMENT RECU LUCAS/,
			}),
		);
		await user.click(
			await screen.findByRole("button", { name: /Not a transfer/ }),
		);

		await waitFor(() =>
			expect(dismissPairsMock).toHaveBeenCalledWith([
				{ debitId: TRANSFER_DEBIT.id, creditId: TRANSFER_CREDIT_NEAR.id },
			]),
		);
	});

	// A popover, not a tooltip, precisely so this works: the trigger is a real
	// button, so it is tabbable and opens on Enter.
	it("opens and operates by keyboard", async () => {
		useTransferFixture();
		const user = userEvent.setup();
		await renderView();

		(await debitIndicator()).focus();
		await user.keyboard("{Enter}");
		await screen.findByText("Possible transfer");

		const confirm = screen.getAllByRole("button", {
			name: "Link as transfer",
		})[0];
		confirm.focus();
		await user.keyboard("{Enter}");

		await waitFor(() =>
			expect(linkTransferMock).toHaveBeenCalledWith([
				TRANSFER_DEBIT.id,
				TRANSFER_CREDIT_NEAR.id,
			]),
		);
	});
});
