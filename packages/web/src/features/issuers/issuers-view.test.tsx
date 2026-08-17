import type { Category, Issuer, Transaction } from "@mamen/shared/contract";
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
import { withShell } from "@/test/sidebar-shell";
import { validateIssuersSearch } from "./search";

// Mock the SDK boundary (PRD "Seam 2"): the table reads the issuers `list`, one
// query per issuer reads its transactions (for count + net), and the category
// tree feeds the Category column. A row's name links to the issuer detail route.
let issuersList: Issuer[];
let transactionsByIssuer: Record<number, Transaction[]>;
let categoriesList: Category[];

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
		categoryQueries: {
			list: () => ({
				queryKey: ["categories", "list", "test"],
				queryFn: async () => ({
					items: categoriesList,
					total: categoriesList.length,
				}),
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

function category(overrides: Partial<Category> = {}): Category {
	return {
		id: 10 as Category["id"],
		name: "Music",
		icon: "music",
		color: "#8b5cf6",
		parentId: null,
		sortOrder: 0,
		...overrides,
	} as Category;
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

// A router harness with the real table and a stub detail route, so a row's
// navigation target resolves.
function renderTable(initialEntry = "/issuers") {
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
	render(withShell(<RouterProvider router={router} />));
}

/**
 * The ordered issuer names as rendered — read from the table's rows, so the
 * order reflects the rows themselves rather than every link on the page (the
 * header's "Create issuer" link is not a row).
 */
async function rowOrder(known: readonly string[]): Promise<string[]> {
	const rows = await screen.findAllByRole("row");
	return rows
		.map((row) => known.find((n) => within(row).queryByText(n)) ?? null)
		.filter((name): name is string => name != null);
}

beforeEach(() => {
	issuersList = [issuer()];
	transactionsByIssuer = { 1: [txn(-10, 1), txn(-5, 1)] };
	categoriesList = [category()];
});

describe("IssuersView", () => {
	it("renders a row with the issuer name, transaction count, and net total", async () => {
		renderTable();

		expect(await screen.findByText("Spotify")).toBeInTheDocument();
		const row = await screen.findByRole("row", { name: /Spotify/ });
		// Two transactions summing to -15 €. One € cell, showing the signed net.
		await waitFor(() => expect(within(row).getByText("2")).toBeInTheDocument());
		expect(within(row).getByText(/^-15/)).toBeInTheDocument();
	});

	it("renders each row's name as a link to its issuer detail page", async () => {
		renderTable();

		const link = await screen.findByRole("link", { name: /Spotify/ });
		expect(link).toHaveAttribute("href", "/issuers/1");
	});

	it("shows the issuer's default category in its own column", async () => {
		issuersList = [issuer({ defaultCategoryId: 10 as Category["id"] })];
		renderTable();

		const row = await screen.findByRole("row", { name: /Spotify/ });
		await waitFor(() =>
			expect(within(row).getByText("Music")).toBeInTheDocument(),
		);
	});

	it("marks an issuer with no default category as unassigned", async () => {
		renderTable();

		const row = await screen.findByRole("row", { name: /Spotify/ });
		expect(within(row).getByText("Unassigned")).toBeInTheDocument();
	});

	it("always offers a header link to create an issuer", async () => {
		renderTable();

		const create = await screen.findByRole("link", { name: "Create issuer" });
		expect(create).toHaveAttribute("href", "/issuers/new");
	});
});

describe("IssuersView empty state", () => {
	beforeEach(() => {
		issuersList = [];
		transactionsByIssuer = {};
		categoriesList = [];
	});

	it("offers a create link and mentions both ways an issuer is born", async () => {
		renderTable();

		// The empty state's own create link points at the standalone form…
		const create = await screen.findByRole("link", {
			name: "Create your first issuer",
		});
		expect(create).toHaveAttribute("href", "/issuers/new");

		// …and the copy names the other birth path (resolving a counterparty).
		expect(screen.getByText(/counterparty/i)).toBeInTheDocument();
	});
});

describe("IssuersView filtering", () => {
	const NAMES = ["Netflix", "Amazon", "Spotify"] as const;

	beforeEach(() => {
		issuersList = [
			issuer({ id: 1 as Issuer["id"], name: "Netflix" }),
			issuer({ id: 2 as Issuer["id"], name: "Amazon" }),
			issuer({ id: 3 as Issuer["id"], name: "Spotify" }),
		];
		transactionsByIssuer = { 1: [], 2: [], 3: [] };
	});

	it("narrows the table to name matches from the URL", async () => {
		renderTable("/issuers?q=net");
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Netflix"]),
		);
	});

	it("matches case- and accent-insensitively", async () => {
		issuersList = [issuer({ id: 4 as Issuer["id"], name: "Crèche" })];
		transactionsByIssuer = { 4: [] };
		renderTable("/issuers?q=CRECHE");

		expect(await screen.findByText("Crèche")).toBeInTheDocument();
	});

	it("filters as the user types", async () => {
		const user = userEvent.setup();
		renderTable();
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Amazon", "Netflix", "Spotify"]),
		);

		await user.type(
			screen.getByRole("searchbox", { name: /Filter issuers/i }),
			"spot",
		);
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Spotify"]),
		);
	});

	it("explains an empty result rather than offering to create an issuer", async () => {
		renderTable("/issuers?q=zzzz");

		expect(await screen.findByText("No matching issuers")).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Create your first issuer" }),
		).not.toBeInTheDocument();
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
		renderTable();
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Amazon", "Netflix", "Spotify"]),
		);
	});

	it("honours the sort + direction from the URL", async () => {
		renderTable("/issuers?sort=count&direction=desc");
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Amazon", "Spotify", "Netflix"]),
		);
	});

	it("sorts by total value (absolute) from the URL", async () => {
		renderTable("/issuers?sort=value&direction=desc");
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Netflix", "Amazon", "Spotify"]),
		);
	});

	it("ranks the Net column by money moved, not by signed net", async () => {
		const user = userEvent.setup();
		// Netflix is a credit, the others debits — so ranking by the *signed* net
		// would put Netflix first. It must rank by magnitude instead.
		transactionsByIssuer = {
			1: [txn(100, 1)],
			2: [txn(-10, 2), txn(-10, 2), txn(-10, 2)],
			3: [txn(-20, 3), txn(-5, 3)],
		};
		renderTable();
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Amazon", "Netflix", "Spotify"]),
		);

		await user.click(await screen.findByRole("button", { name: /Net/ }));
		// |value| desc: Netflix (100), Amazon (30), Spotify (25).
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Netflix", "Amazon", "Spotify"]),
		);
	});

	it("re-sorts when a column header is clicked", async () => {
		const user = userEvent.setup();
		renderTable();
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Amazon", "Netflix", "Spotify"]),
		);

		await user.click(screen.getByRole("button", { name: /Transactions/ }));
		// Count desc: Amazon (3), Spotify (2), Netflix (1).
		await waitFor(async () =>
			expect(await rowOrder(NAMES)).toEqual(["Amazon", "Spotify", "Netflix"]),
		);
	});
});
