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
			queryFn: async () => (id === TXN.id ? TXN : undefined),
		}),
		list: (params: Record<string, unknown>) => ({
			queryKey: ["transactions", "list", params],
			queryFn: async () => ({ items: [], total: 0 }),
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
function makeRouter() {
	const rootRoute = createRootRoute();
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions_/$transactionId",
		component: TransactionDetailPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([detailRoute]),
		history: createMemoryHistory({ initialEntries: ["/transactions_/100"] }),
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
});
