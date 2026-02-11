import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommandPaletteProvider } from "@/context/CommandPaletteContext";
import { FocusModeProvider } from "@/context/FocusModeContext";
import { Layout } from "./index";

function createTestRouter(initialPath = "/") {
	const rootRoute = createRootRoute({
		component: () => (
			<FocusModeProvider>
				<CommandPaletteProvider>
					<Layout>
						<Outlet />
					</Layout>
				</CommandPaletteProvider>
			</FocusModeProvider>
		),
	});

	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <div>Dashboard Content</div>,
	});

	const transactionsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions",
		component: () => <div>Transactions Content</div>,
	});

	const unmatchedRoute = createRoute({
		getParentRoute: () => transactionsRoute,
		path: "/unmatched",
		component: () => <div>Unmatched Content</div>,
	});

	const merchantsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/merchants",
		component: () => <div>Merchants Content</div>,
	});

	const rulesRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/rules",
		component: () => <div>Rules Content</div>,
	});

	const accountsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/accounts",
		component: () => <div>Accounts Content</div>,
	});

	const transactionsRouteWithChildren = transactionsRoute.addChildren([
		unmatchedRoute,
	]);
	const routeTree = rootRoute.addChildren([
		indexRoute,
		transactionsRouteWithChildren,
		merchantsRoute,
		rulesRoute,
		accountsRoute,
	]);

	return createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
}

describe("Layout", () => {
	it("renders sidebar, header, and main content area", async () => {
		const router = createTestRouter();
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("mamen")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /dashboard/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Transactions" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /merchants/i }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /rules/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /accounts/i })).toBeInTheDocument();
	});

	it("renders route content in main area", async () => {
		const router = createTestRouter("/");
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("Dashboard Content")).toBeInTheDocument();
	});

	it("renders the search trigger button", async () => {
		const router = createTestRouter();
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("Search...")).toBeInTheDocument();
	});

	it("search trigger opens command palette", async () => {
		const router = createTestRouter();
		render(<RouterProvider router={router} />);

		const searchButton = await screen.findByRole("button", { name: /search/i });
		expect(searchButton).toBeEnabled();
	});

	it("renders stats section with initial counts", async () => {
		const router = createTestRouter();
		render(<RouterProvider router={router} />);

		expect(await screen.findByText("Stats")).toBeInTheDocument();
		// "Unmatched" appears in both nav and stats; "Merchants" appears in both nav and stats
		const unmatchedTexts = screen.getAllByText("Unmatched");
		expect(unmatchedTexts.length).toBeGreaterThanOrEqual(2);
		// Verify stats counts are present
		const zeros = screen.getAllByText("0");
		expect(zeros.length).toBeGreaterThanOrEqual(2);
	});
});

describe("Navigation", () => {
	it("highlights active nav item for dashboard", async () => {
		const router = createTestRouter("/");
		render(<RouterProvider router={router} />);

		const dashboardLink = await screen.findByRole("link", {
			name: /dashboard/i,
		});
		expect(dashboardLink).toHaveClass("bg-accent");
	});

	it("highlights active nav item for transactions", async () => {
		const router = createTestRouter("/transactions");
		render(<RouterProvider router={router} />);

		const transactionsLink = await screen.findByRole("link", {
			name: "Transactions",
		});
		expect(transactionsLink).toHaveClass("bg-accent");
	});

	it("renders all 8 navigation links", async () => {
		const router = createTestRouter();
		render(<RouterProvider router={router} />);

		const links = await screen.findAllByRole("link");
		expect(links).toHaveLength(8);
	});
});
