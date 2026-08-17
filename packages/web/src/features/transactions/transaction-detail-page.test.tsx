import type { Issuer, Transaction } from "@mamen/shared/contract";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLAPSED_SHELL, OPEN_SHELL, withShell } from "@/test/sidebar-shell";

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

/**
 * The same parent after a refund was counted twice (issue #76): its members sum
 * to a credit, so the server has flagged it. The flag is a warning — the amount
 * is still exactly what the members say — and it surfaces where every anomaly
 * already does.
 */
const FLAGGED_BUNDLE = {
	...BUNDLE,
	id: 400,
	amount: 100,
	anomalyFlags: [
		{
			type: "non-negative-bundle",
			reason:
				"This bundle's members sum to zero or more, so it is not a cost. A member may have been added by mistake, or a refund counted twice.",
			detectedAt: "2026-03-13T00:00:00.000Z",
			dismissed: false,
		},
	],
} as unknown as Transaction;

/**
 * A row that is already a **transfer leg** (issue #75): its group nets it out of
 * the recap, so nothing may also bundle it — the page has to say that where the
 * bundling action is, rather than let the user earn a 422.
 */
const LEG = {
	id: 500,
	accountId: 1,
	date: new Date("2026-03-20T00:00:00Z"),
	amount: -30,
	rawIssuerString: "VIREMENT COMPTE JOINT",
	transferGroupId: 500,
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
 * A candidate counterpart for `TXN` (issue #91) — the credit half of the same
 * 9,99 € movement, in the other account. Empty for every test that isn't about
 * suggestions.
 */
const COUNTERPART = {
	id: 900,
	accountId: 2,
	date: new Date("2026-01-21T00:00:00Z"),
	amount: 9.99,
	rawIssuerString: "VIREMENT RECU",
	importedAt: new Date(),
	importMonth: "2026-01",
} as unknown as Transaction;

let candidateRows: Array<Record<string, unknown>> = [];

/**
 * An id whose read never settles, so a test can hold the page in its **loading**
 * state and look at it. Every other id resolves on the next tick, which is far
 * too fast to assert anything about the wait.
 */
const PENDING_ID = 999;

vi.mock("@mamen/sdk", () => ({
	transactionQueries: {
		getById: (id: number) => ({
			queryKey: ["transactions", "detail", id],
			queryFn: async () =>
				id === PENDING_ID
					? new Promise<never>(() => {})
					: id === TXN.id
						? TXN
						: id === BUNDLE.id
							? BUNDLE
							: id === FLAGGED_BUNDLE.id
								? FLAGGED_BUNDLE
								: id === LEG.id
									? LEG
									: undefined,
		}),
		list: (params: Record<string, unknown>) => ({
			queryKey: ["transactions", "list", params],
			queryFn: async () =>
				params.bundleId === BUNDLE.id || params.bundleId === FLAGGED_BUNDLE.id
					? { items: MEMBERS, total: MEMBERS.length }
					: // The bundles a row may join (issue #74) — the parents, asked for
						// by kind rather than by scanning the whole table for them.
						params.kind === "bundle"
						? { items: [BUNDLE], total: 1 }
						: { items: [], total: 0 },
		}),
		// The shared transfer-suggestion read (issue #91) — the Transfer block now
		// reads its counterparts out of this one cache entry instead of scanning
		// whatever rows the page happened to have loaded.
		transferCandidates: () => ({
			queryKey: ["transactions", "transfer-candidates"],
			queryFn: async () => candidateRows,
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
		searchByName: (term: string) => issuerSearchMock(term),
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
	transactionMutations: {
		linkTransfer: (ids: unknown) => linkTransferMock(ids),
		dismissTransferPairs: (pairs: unknown) => dismissPairsMock(pairs),
	},
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

/**
 * The page's topbar is a `PageLayout` (issue #129), which reads the shell's
 * collapse flag; this harness mounts the route without `AppShell`, so it stands
 * in for it — open, unless a case is about the trigger itself.
 */
function renderPage(id = 100, shellValue = OPEN_SHELL) {
	return render(
		withShell(<RouterProvider router={makeRouter(id)} />, shellValue),
	);
}

const linkTransferMock = vi.fn(async (_ids: unknown) => ({ count: 2 }));
const dismissPairsMock = vi.fn(async (_pairs: unknown) => ({ count: 1 }));

beforeEach(() => {
	issuerByIdsMock.mockClear();
	linkTransferMock.mockClear();
	dismissPairsMock.mockClear();
	candidateRows = [];
});

describe("TransactionDetailPage", () => {
	// The last page to compose its own header, and so the last one with no way
	// back to a collapsed sidebar (issue #129).
	it("offers the sidebar-reopen trigger while the panel is collapsed", async () => {
		renderPage(100, COLLAPSED_SHELL);

		expect(
			await screen.findByRole("button", { name: "Open sidebar" }),
		).toBeInTheDocument();
	});

	// A page that is still reading is still a page. The wait is short when the
	// row is cached and not at all short when it isn't, and the collapse flag
	// outlives the navigation that got here — so the loading state carries the
	// same topbar the settled one does (issue #129).
	it("carries the topbar while the row is still loading", async () => {
		renderPage(PENDING_ID, COLLAPSED_SHELL);

		expect(
			await screen.findByRole("button", { name: "Open sidebar" }),
		).toBeInTheDocument();
		// Titled by what the page *is* until the row names it — the same stand-in
		// title the not-found state uses, for the same reason: there is no
		// counterparty to show yet.
		expect(
			screen.getByRole("heading", { level: 1, name: "Transaction" }),
		).toBeInTheDocument();
		// The way back needs no data, so it is real from the first frame rather
		// than a placeholder bar that turns into a link.
		expect(
			screen.getByRole("link", { name: "Transactions" }),
		).toBeInTheDocument();
	});

	// The amount was the headline above the name; it is the topbar's action end
	// now, where every other drill-down page puts its number.
	it("keeps the amount, the counterparty and the date in one topbar", async () => {
		renderPage();

		const topbar = (
			await screen.findByRole("heading", { level: 1, name: "Spotify" })
		).closest("header") as HTMLElement;
		expect(within(topbar).getByText("-9,99 €")).toBeInTheDocument();
	});

	// The #62 regression on the detail surface: one row, one issuer id, asked for
	// by id — so where that id sorts in the issuer table is nobody's business.
	it("names the issuer the list read would have missed", async () => {
		renderPage();

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
		renderPage(300);

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
		renderPage(300);

		// The members are rows of the ordinary transactions grid, so each is named
		// by the **Raw issuer** column and — while uncurated — by the assignment
		// picker offering to resolve that same string.
		expect((await screen.findAllByText(/CARREFOUR MARKET/))[0]).toBeVisible();
		expect(screen.getAllByText(/VIREMENT LUCAS/)[0]).toBeVisible();
		// The date is the bundle's own to override; the amount is the members' sum
		// and has no control anywhere on the page.
		expect(screen.getByLabelText(/bundle date/i)).toBeVisible();
		expect(screen.queryByLabelText(/amount/i)).toBeNull();
	});

	// A bank row gets the other side of the same block (issue #74): it has no
	// members and no date of its own, but it has a bundle to join.
	it("offers an ordinary bank row a bundle to join, not a parent's block", async () => {
		renderPage();

		await screen.findByRole("heading", { name: "Spotify" });
		expect(screen.queryByLabelText(/bundle date/i)).toBeNull();
		expect(await screen.findByLabelText(/bundle to join/i)).toBeVisible();
	});

	// Dissolving is the parent's own action, and it is never offered on a row
	// that merely belongs to one — a member leaves, a bundle dissolves.
	it("offers dissolving only on the bundle parent", async () => {
		renderPage(300);

		expect(
			await screen.findByRole("button", { name: /dissolve bundle/i }),
		).toBeVisible();
	});

	// Issue #76: a bundle that sums to zero or to a credit is usually a
	// mis-bundling, and the server says so through the anomaly flags the page
	// already renders — no new surface, and nothing that blocks the row.
	it("warns on a bundle whose members do not sum to a cost", async () => {
		renderPage(400);

		expect(await screen.findByText("Bundle is not a cost")).toBeVisible();
		expect(screen.getByText(/a refund counted twice/i)).toBeVisible();
		// The warning changes nothing: the parent still shows its members' sum, and
		// the way out is the membership controls, not the flag.
		expect(screen.getAllByText(/^\+100/).length).toBeGreaterThan(0);
		expect(
			screen.getByRole("button", { name: /dissolve bundle/i }),
		).toBeVisible();
	});

	// Issue #75, both directions on the one page that shows both blocks. A parent
	// stands for money the recap already counts at a non-zero sum, and its amount
	// moves with its members — so the Transfer block offers it nothing.
	it("tells a bundle parent it can't be part of a transfer", async () => {
		renderPage(300);

		expect(
			await screen.findByText(
				/bundled transaction can't be part of a transfer/i,
			),
		).toBeVisible();
		expect(
			screen.queryByRole("button", { name: /link as transfer/i }),
		).toBeNull();
	});

	// And the mirror: a transfer leg is offered the bundle picker disabled, with
	// the reason beside it, instead of a request that comes back a 422.
	it("tells a transfer leg it can't be bundled", async () => {
		renderPage(500);

		expect(
			await screen.findByText(/transfer leg can't be bundled/i),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: /add to bundle/i }),
		).toBeDisabled();
	});

	it("says so plainly when a row carries no anomaly", async () => {
		renderPage(300);

		expect(await screen.findByText("No anomaly flags.")).toBeVisible();
	});

	// Story 35 (issue #91): the detail page's suggestions come from the SAME cache
	// entry as the table's, so the two surfaces can never disagree about a pair.
	// It used to run a client-side scan over whatever rows it had loaded — a
	// second, weaker answer to a question the server already decides.
	it("reads its counterparts from the shared candidate cache", async () => {
		candidateRows = [
			{ leg: TXN, counterparts: [{ transaction: COUNTERPART, daysApart: 1 }] },
		];
		renderPage();

		expect(await screen.findByText("VIREMENT RECU")).toBeVisible();
		expect(screen.getByText(/1 day apart/)).toBeVisible();
		expect(
			screen.getByRole("button", { name: /link as transfer/i }),
		).toBeVisible();
	});

	// One group-level refusal here too, worded the same as the table's panel — a
	// per-suggestion button would lie about what it clears.
	it("offers one group-level dismissal, normalised debit-first", async () => {
		const user = userEvent.setup();
		candidateRows = [
			{ leg: TXN, counterparts: [{ transaction: COUNTERPART, daysApart: 1 }] },
		];
		renderPage();

		await user.click(
			await screen.findByRole("button", { name: /not a transfer/i }),
		);

		expect(dismissPairsMock).toHaveBeenCalledWith([
			{ debitId: TXN.id, creditId: COUNTERPART.id },
		]);
	});
});
