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

const listMock = vi.fn((params: Record<string, unknown>) => ({
	queryKey: ["transactions", "list", params],
	queryFn: async () => ({ items: TXNS, total: TXNS.length }),
}));

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
	// Wait for the table to render (a known unresolved row) so the sort header and
	// rows exist before a test interacts with them.
	await screen.findByText("ACME PAYROLL");
	return router;
}

beforeEach(() => {
	listMock.mockClear();
});

describe("TransactionsView", () => {
	it("renders the table with newest-first data and signed, colored amounts", async () => {
		await renderView();

		// Resolved row (issuerId 10) → issuer name, not the raw string;
		// unresolved row (no issuerId) → raw counterparty text.
		expect(screen.getByText("Spotify")).toBeInTheDocument();
		expect(screen.queryByText("SPOTIFY P2A34")).not.toBeInTheDocument();
		expect(screen.getByText("ACME PAYROLL")).toBeInTheDocument();
		// Account column resolves the id to a name.
		expect(screen.getAllByText("Checking").length).toBeGreaterThan(0);

		// Debit is red (high) and negative; credit is green (low) and positive.
		const debit = screen.getByText(/9,99/);
		expect(debit).toHaveClass("text-high");
		const credit = screen.getByText(/2\s?500/);
		expect(credit).toHaveClass("text-low");

		// Default sort is desc, so `list` is called with orderBy date / desc.
		expect(listMock).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: "date",
				direction: "desc",
				offset: 0,
			}),
		);
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
});
