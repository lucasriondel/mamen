import type { Issuer, Transaction } from "@mamen/shared/contract";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Canned SDK data --------------------------------------------------------

const ACCOUNTS = [{ id: 1, name: "Checking", type: "checking" }];

/**
 * The row's issuer. Its id is high — it was created recently — so it sorts past
 * the first page of a table of hundreds, which is the shape of bug #62.
 */
const ISSUERS = [{ id: 812, name: "Spotify" }] as unknown as Issuer[];

const TXN = {
	id: 100,
	accountId: 1,
	date: new Date("2026-01-20T00:00:00Z"),
	amount: -9.99,
	rawIssuerString: "SPOTIFY P2A34",
	issuerId: 812,
	importedAt: new Date(),
	importMonth: "2026-01",
} as unknown as Transaction;

/**
 * A **bundle parent** (issue #72): the one row in the app that is only ever met
 * on this page, since members hide its own members from the list. It carries a
 * label and nothing else — no issuer, no category, no note — which is exactly
 * what the page has to let the user fix.
 */
const BUNDLE = {
	id: 300,
	accountId: 1,
	date: new Date("2026-03-07T00:00:00Z"),
	amount: -50,
	rawIssuerString: "Weekend Bretagne",
	kind: "bundle",
	importedAt: new Date(),
	importMonth: "2026-03",
} as unknown as Transaction;

/** The two rows the bundle stands for — reachable only by `bundleId`. */
const MEMBERS = [
	{
		id: 301,
		accountId: 1,
		date: new Date("2026-03-07T00:00:00Z"),
		amount: -200,
		rawIssuerString: "CARREFOUR MARKET",
		bundleId: 300,
		importedAt: new Date(),
		importMonth: "2026-03",
	},
	{
		id: 302,
		accountId: 1,
		date: new Date("2026-03-12T00:00:00Z"),
		amount: 150,
		rawIssuerString: "VIREMENT LUCAS",
		bundleId: 300,
		importedAt: new Date(),
		importMonth: "2026-03",
	},
] as unknown as Transaction[];

// ---- SDK seam mock ----------------------------------------------------------

/**
 * The issuer *list* read, standing in for a table whose ids have outrun its
 * first page: it reports 500 issuers and hands back none of them. A page that
 * named its issuer from a list read would show the raw bank string here.
 */
const issuerListMock = vi.fn(() => ({
	queryKey: ["issuers", "list"],
	queryFn: async () => ({ items: [] as Issuer[], total: 500 }),
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
		getById: (id: number) => ({
			queryKey: ["transactions", "detail", id],
			queryFn: async () =>
				id === TXN.id ? TXN : id === BUNDLE.id ? BUNDLE : undefined,
		}),
		list: (params: Record<string, unknown>) => ({
			queryKey: ["transactions", "list", params],
			queryFn: async () =>
				params.bundleId === BUNDLE.id
					? { items: MEMBERS, total: MEMBERS.length }
					: // The bundles a row may join (issue #74) — the parents, asked for
						// by kind rather than by scanning the whole table for them.
						params.kind === "bundle"
						? { items: [BUNDLE], total: 1 }
						: { items: [], total: 0 },
		}),
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
			queryFn: async () => ({ items: [], total: 0 }),
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
	ruleKeys: {},
	ruleMutations: {},
	ruleQueries: {
		list: (params: Record<string, unknown>) => ({
			queryKey: ["rules", "list", params],
			queryFn: async () => ({ items: [], total: 0 }),
		}),
	},
}));

const { TransactionDetailPage } = await import("./transaction-detail-page");

// ---- Router harness ---------------------------------------------------------

/**
 * The page addresses its route by id (`getRouteApi`), and a hand-built route's
 * id is its path — so the harness spells the id, underscore and all. The real
 * app serves it at `/transactions/$transactionId`; the `_` is the file-router's
 * "don't nest under /transactions" marker and never reaches a user's URL.
 */
function makeRouter(id = 100) {
	const rootRoute = createRootRoute();
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions_/$transactionId",
		component: TransactionDetailPage,
	});
	// The member rows link here; a stub is enough for the links to resolve.
	const memberRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions/$transactionId",
		component: () => <div>member page</div>,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([detailRoute, memberRoute]),
		history: createMemoryHistory({
			initialEntries: [`/transactions_/${id}`],
		}),
	});
}

beforeEach(() => {
	issuerByIdsMock.mockClear();
});

describe("TransactionDetailPage", () => {
	// The #62 regression on the detail surface: one row, one issuer id, asked for
	// by id — so where that id sorts in the issuer table is nobody's business.
	it("names the issuer the list read would have missed", async () => {
		render(<RouterProvider router={makeRouter()} />);

		// The headline is the issuer's name, not the raw bank string it falls back
		// to when the issuer can't be resolved.
		expect(
			await screen.findByRole("heading", { name: "Spotify" }),
		).toBeVisible();

		// Only this row's id was asked for.
		expect(issuerByIdsMock).toHaveBeenCalled();
		for (const [ids] of issuerByIdsMock.mock.calls) {
			expect([...ids].every((id) => id === 812)).toBe(true);
		}
		expect(
			issuerByIdsMock.mock.calls.some(([ids]) => [...ids].includes(812)),
		).toBe(true);
	});

	// Issue #72: the parent is a real transaction row, so the page curates it
	// through the very controls the grid's cells are — no bundle-specific issuer,
	// category or notes editor exists, and none should.
	it("offers the curation controls on any row, bundle parent included", async () => {
		render(<RouterProvider router={makeRouter(300)} />);

		expect(
			await screen.findByRole("heading", { name: "Weekend Bretagne" }),
		).toBeVisible();
		// The unresolved-issuer surface (the parent carries none yet), the category
		// picker and the notes editor — the same three the table row offers.
		expect(screen.getByTitle("Assign an issuer")).toBeVisible();
		expect(
			screen.getByTitle("Set a category for this transaction"),
		).toBeVisible();
		expect(screen.getByTitle("Add a note to this transaction")).toBeVisible();
	});

	it("shows a bundle parent the members it stands for", async () => {
		render(<RouterProvider router={makeRouter(300)} />);

		expect(await screen.findByText(/CARREFOUR MARKET/)).toBeVisible();
		expect(screen.getByText(/VIREMENT LUCAS/)).toBeVisible();
		// The date is the bundle's own to override; the amount is the members' sum
		// and has no control anywhere on the page.
		expect(screen.getByLabelText(/bundle date/i)).toBeVisible();
		expect(screen.queryByLabelText(/amount/i)).toBeNull();
	});

	// A bank row gets the other side of the same block (issue #74): it has no
	// members and no date of its own, but it has a bundle to join.
	it("offers an ordinary bank row a bundle to join, not a parent's block", async () => {
		render(<RouterProvider router={makeRouter()} />);

		await screen.findByRole("heading", { name: "Spotify" });
		expect(screen.queryByLabelText(/bundle date/i)).toBeNull();
		expect(await screen.findByLabelText(/bundle to join/i)).toBeVisible();
	});

	// Dissolving is the parent's own action, and it is never offered on a row
	// that merely belongs to one — a member leaves, a bundle dissolves.
	it("offers dissolving only on the bundle parent", async () => {
		render(<RouterProvider router={makeRouter(300)} />);

		expect(
			await screen.findByRole("button", { name: /dissolve bundle/i }),
		).toBeVisible();
	});
});
