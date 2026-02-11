import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FocusModeProvider } from "@/context/FocusModeContext";
import { db } from "@/lib/db";
import type { Transaction } from "@/types";
import { TransactionList } from "./index";

const transactionSearchSchema = z.object({
	highlight: z.coerce.number().optional(),
	categoryId: z.coerce.number().optional(),
	periodStart: z.string().optional(),
	periodEnd: z.string().optional(),
	from: z.string().optional(),
});

const makeTransaction = (
	overrides: Partial<Transaction> = {},
): Omit<Transaction, "id"> => ({
	accountId: 1,
	date: new Date(2026, 1, 15),
	amount: -45.99,
	rawMerchantString: "AMZN*1234XYZ",
	importedAt: new Date(),
	importMonth: "2026-02",
	...overrides,
});

function renderWithDrillDown(search = ""): ReturnType<typeof render> {
	const rootRoute = createRootRoute();

	const transactionsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions",
		validateSearch: transactionSearchSchema,
		component: () => (
			<FocusModeProvider>
				<div className="flex flex-col" style={{ height: "600px" }}>
					<TransactionList />
				</div>
			</FocusModeProvider>
		),
	});

	const dashboardRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <div data-testid="dashboard-page">Dashboard</div>,
	});

	const routeTree = rootRoute.addChildren([transactionsRoute, dashboardRoute]);

	const router = createRouter({
		routeTree,
		history: createMemoryHistory({
			initialEntries: [`/transactions${search}`],
		}),
	});

	return render(<RouterProvider router={router} />);
}

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const originalOffsetHeight = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	"offsetHeight",
);
const originalScrollHeight = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	"scrollHeight",
);

beforeEach(async () => {
	await db.transactions.clear();
	await db.categories.clear();
	await db.merchants.clear();

	Element.prototype.getBoundingClientRect = vi.fn(() => ({
		width: 800,
		height: 600,
		top: 0,
		left: 0,
		bottom: 600,
		right: 800,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	}));

	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		get() {
			return 600;
		},
	});

	Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
		configurable: true,
		get() {
			return 600;
		},
	});
});

afterEach(() => {
	Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
	if (originalOffsetHeight) {
		Object.defineProperty(
			HTMLElement.prototype,
			"offsetHeight",
			originalOffsetHeight,
		);
	}
	if (originalScrollHeight) {
		Object.defineProperty(
			HTMLElement.prototype,
			"scrollHeight",
			originalScrollHeight,
		);
	}
});

describe("Drill-down integration", () => {
	it("filters transactions by categoryId from search params", async () => {
		const catId = await db.categories.add({
			name: "Shopping",
			slug: "shopping",
			color: "#3B82F6",
			icon: "ShoppingCart",
			parentId: null,
			sortOrder: 0,
			createdAt: new Date(),
		});

		await db.transactions.bulkAdd([
			makeTransaction({
				rawMerchantString: "SHOP A",
				categoryId: catId as number,
				amount: -10,
			}),
			makeTransaction({
				rawMerchantString: "SHOP B",
				categoryId: catId as number,
				amount: -20,
			}),
			makeTransaction({
				rawMerchantString: "DINING C",
				categoryId: 999,
				amount: -30,
			}),
			makeTransaction({ rawMerchantString: "NO CAT", amount: -40 }),
		]);

		renderWithDrillDown(`?categoryId=${catId}`);

		await waitFor(() => {
			expect(screen.getByText("SHOP A")).toBeInTheDocument();
			expect(screen.getByText("SHOP B")).toBeInTheDocument();
		});

		expect(screen.queryByText("DINING C")).not.toBeInTheDocument();
		expect(screen.queryByText("NO CAT")).not.toBeInTheDocument();
	});

	it("shows filter indicator bar when drill-down is active", async () => {
		const catId = await db.categories.add({
			name: "Shopping",
			slug: "shopping",
			color: "#3B82F6",
			icon: "ShoppingCart",
			parentId: null,
			sortOrder: 0,
			createdAt: new Date(),
		});

		await db.transactions.add(
			makeTransaction({
				rawMerchantString: "SHOP A",
				categoryId: catId as number,
				amount: -10,
			}),
		);

		renderWithDrillDown(`?categoryId=${catId}&from=dashboard`);

		await waitFor(() => {
			expect(screen.getByTestId("drill-down-filter-bar")).toBeInTheDocument();
		});

		expect(screen.getByTestId("category-filter-chip")).toBeInTheDocument();
		expect(screen.getByTestId("category-filter-chip")).toHaveTextContent(
			"Shopping",
		);
		expect(screen.getByText(/Showing 1 transactions/)).toBeInTheDocument();
	});

	it("does not show filter indicator when no drill-down", async () => {
		await db.transactions.add(makeTransaction());

		renderWithDrillDown();

		await waitFor(() => {
			expect(screen.getByText("AMZN*1234XYZ")).toBeInTheDocument();
		});

		expect(
			screen.queryByTestId("drill-down-filter-bar"),
		).not.toBeInTheDocument();
	});

	it("shows all transactions when no filter", async () => {
		await db.transactions.bulkAdd([
			makeTransaction({ rawMerchantString: "TX A", amount: -10 }),
			makeTransaction({ rawMerchantString: "TX B", amount: -20 }),
			makeTransaction({ rawMerchantString: "TX C", amount: -30 }),
		]);

		renderWithDrillDown();

		await waitFor(() => {
			expect(screen.getByText("TX A")).toBeInTheDocument();
			expect(screen.getByText("TX B")).toBeInTheDocument();
			expect(screen.getByText("TX C")).toBeInTheDocument();
		});
	});

	it("shows empty state with category name when drill-down has no matching transactions", async () => {
		const catId = await db.categories.add({
			name: "Shopping",
			slug: "shopping",
			color: "#3B82F6",
			icon: "ShoppingCart",
			parentId: null,
			sortOrder: 0,
			createdAt: new Date(),
		});

		renderWithDrillDown(`?categoryId=${catId}`);

		await waitFor(() => {
			expect(
				screen.getByText(/No transactions in Shopping/),
			).toBeInTheDocument();
		});

		expect(
			screen.getByRole("button", { name: /View All Transactions/ }),
		).toBeInTheDocument();
	});

	it("filters by date range from search params", async () => {
		const catId = await db.categories.add({
			name: "Shopping",
			slug: "shopping",
			color: "#3B82F6",
			icon: "ShoppingCart",
			parentId: null,
			sortOrder: 0,
			createdAt: new Date(),
		});

		await db.transactions.bulkAdd([
			makeTransaction({
				rawMerchantString: "FEB SHOP",
				categoryId: catId as number,
				amount: -10,
				date: new Date(2026, 1, 15),
			}),
			makeTransaction({
				rawMerchantString: "JAN SHOP",
				categoryId: catId as number,
				amount: -20,
				date: new Date(2026, 0, 10),
			}),
		]);

		const periodStart = new Date(2026, 1, 1).toISOString();
		const periodEnd = new Date(2026, 1, 28, 23, 59, 59, 999).toISOString();

		renderWithDrillDown(
			`?categoryId=${catId}&periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
		);

		await waitFor(() => {
			expect(screen.getByText("FEB SHOP")).toBeInTheDocument();
		});

		expect(screen.queryByText("JAN SHOP")).not.toBeInTheDocument();
	});
});
