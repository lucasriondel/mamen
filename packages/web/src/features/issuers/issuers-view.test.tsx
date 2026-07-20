import type { Issuer, Transaction } from "@mamen/shared/contract";
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
import { validateIssuersSearch } from "./search";

// Mock the SDK boundary (PRD "Seam 2"): the grid reads the issuers `list`, each
// card reads that issuer's transactions (for count + net). Clicking a card now
// navigates to the issuer detail route rather than opening a dialog.
let issuersList: Issuer[];
let transactionsByIssuer: Record<number, Transaction[]>;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		issuerQueries: {
			list: () => ({
				queryKey: ["issuers", "list", "test"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		transactionQueries: {
			list: (params: { issuerId?: number }) => ({
				queryKey: ["transactions", "list", params],
				queryFn: async () => {
					const items = transactionsByIssuer[params.issuerId ?? -1] ?? [];
					return { items, total: items.length };
				},
			}),
		},
	};
});

const { IssuersView } = await import("./issuers-view");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
	return {
		id: 1 as Issuer["id"],
		name: "Spotify",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...overrides,
	} as Issuer;
}

function txn(amount: number, issuerId: number): Transaction {
	return {
		id: (issuerId * 100 + amount) as Transaction["id"],
		accountId: 1 as Transaction["accountId"],
		date: new Date("2026-01-10"),
		amount,
		rawIssuerString: "RAW",
		issuerId: issuerId as Transaction["issuerId"],
		importedAt: new Date(),
		importMonth: "2026-01",
	} as Transaction;
}

// A router harness with the real grid and a stub detail route, so the card's
// navigation target resolves.
function renderGrid(initialEntry = "/issuers") {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/",
		validateSearch: validateIssuersSearch,
		component: IssuersView,
	});
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId",
		component: () => <p>Detail for {"" /* placeholder */}</p>,
	});
	const newRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/new",
		component: () => <p>Create issuer page</p>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute, detailRoute, newRoute]),
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
	render(<RouterProvider router={router} />);
}

/**
 * The ordered issuer names as rendered — matched against the known name list so
 * we read the card order without depending on the card's full accessible name.
 */
async function cardOrder(known: readonly string[]): Promise<string[]> {
	const links = await screen.findAllByRole("link");
	// Keep only the issuer cards (a link naming a known issuer); the header's
	// "Create issuer" link is not a card and is dropped.
	return links
		.map((link) => known.find((n) => within(link).queryByText(n)) ?? null)
		.filter((name): name is string => name != null);
}

beforeEach(() => {
	issuersList = [issuer()];
	transactionsByIssuer = { 1: [txn(-10, 1), txn(-5, 1)] };
});

describe("IssuersView", () => {
	it("renders a card with the issuer name, transaction count, and net total", async () => {
		renderGrid();

		expect(await screen.findByText("Spotify")).toBeInTheDocument();
		// Two transactions summing to -15 €.
		await waitFor(() =>
			expect(screen.getByText(/2 transactions/)).toBeInTheDocument(),
		);
		expect(screen.getByText(/15/)).toBeInTheDocument();
	});

	it("renders each card as a link to its issuer detail page", async () => {
		renderGrid();

		const card = await screen.findByRole("link", { name: /Spotify/ });
		expect(card).toHaveAttribute("href", "/issuers/1");
	});

	it("always offers a header link to create an issuer", async () => {
		renderGrid();

		const create = await screen.findByRole("link", { name: "Create issuer" });
		expect(create).toHaveAttribute("href", "/issuers/new");
	});
});

describe("IssuersView empty state", () => {
	beforeEach(() => {
		issuersList = [];
		transactionsByIssuer = {};
	});

	it("offers a create link and mentions both ways an issuer is born", async () => {
		renderGrid();

		// The empty state's own create link points at the standalone form…
		const create = await screen.findByRole("link", {
			name: "Create your first issuer",
		});
		expect(create).toHaveAttribute("href", "/issuers/new");

		// …and the copy names the other birth path (resolving a counterparty).
		expect(screen.getByText(/counterparty/i)).toBeInTheDocument();
	});
});

describe("IssuersView sorting", () => {
	const NAMES = ["Netflix", "Amazon", "Spotify"] as const;

	beforeEach(() => {
		// Netflix: 1 txn, |value| 100; Amazon: 3 txns, |value| 30; Spotify: 2 txns,
		// |value| 25. So each sort key produces a distinct order.
		issuersList = [
			issuer({ id: 1 as Issuer["id"], name: "Netflix" }),
			issuer({ id: 2 as Issuer["id"], name: "Amazon" }),
			issuer({ id: 3 as Issuer["id"], name: "Spotify" }),
		];
		transactionsByIssuer = {
			1: [txn(-100, 1)],
			2: [txn(-10, 2), txn(-10, 2), txn(-10, 2)],
			3: [txn(-20, 3), txn(-5, 3)],
		};
	});

	it("defaults to alphabetical A→Z", async () => {
		renderGrid();
		await waitFor(async () =>
			expect(await cardOrder(NAMES)).toEqual(["Amazon", "Netflix", "Spotify"]),
		);
	});

	it("honours the sort + direction from the URL", async () => {
		renderGrid("/issuers?sort=count&direction=desc");
		await waitFor(async () =>
			expect(await cardOrder(NAMES)).toEqual(["Amazon", "Spotify", "Netflix"]),
		);
	});

	it("sorts by total value (absolute) from the URL", async () => {
		renderGrid("/issuers?sort=value&direction=desc");
		await waitFor(async () =>
			expect(await cardOrder(NAMES)).toEqual(["Netflix", "Amazon", "Spotify"]),
		);
	});

	it("re-sorts when a sort control is clicked", async () => {
		const user = userEvent.setup();
		renderGrid();
		await waitFor(async () =>
			expect(await cardOrder(NAMES)).toEqual(["Amazon", "Netflix", "Spotify"]),
		);

		await user.click(screen.getByRole("button", { name: /Transactions/ }));
		// Count desc: Amazon (3), Spotify (2), Netflix (1).
		await waitFor(async () =>
			expect(await cardOrder(NAMES)).toEqual(["Amazon", "Spotify", "Netflix"]),
		);
	});
});
