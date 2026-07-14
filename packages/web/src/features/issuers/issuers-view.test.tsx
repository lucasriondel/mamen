import type { Issuer, Transaction } from "@mamen/shared/contract";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
function renderGrid() {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/",
		component: IssuersView,
	});
	const detailRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/issuers/$issuerId",
		component: () => <p>Detail for {"" /* placeholder */}</p>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
		history: createMemoryHistory({ initialEntries: ["/issuers"] }),
	});
	render(<RouterProvider router={router} />);
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
});
