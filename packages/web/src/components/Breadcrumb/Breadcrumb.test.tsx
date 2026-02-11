import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { BreadcrumbSegment } from "./index";
import { Breadcrumb } from "./index";

async function renderBreadcrumb(
	segments: BreadcrumbSegment[],
	className?: string,
): Promise<ReturnType<typeof render>> {
	const rootRoute = createRootRoute({
		component: () => (
			<>
				<Breadcrumb segments={segments} className={className} />
				<Outlet />
			</>
		),
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <div>Home</div>,
	});
	const transactionsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions",
		component: () => <div>Transactions</div>,
	});
	const merchantsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/merchants",
		component: () => <div>Merchants</div>,
	});
	const routeTree = rootRoute.addChildren([
		indexRoute,
		transactionsRoute,
		merchantsRoute,
	]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	const result = render(<RouterProvider router={router} />);
	await waitFor(() => {
		expect(screen.getByText("Home")).toBeInTheDocument();
	});
	return result;
}

describe("Breadcrumb", () => {
	it("returns null when segments have 1 or fewer items", async () => {
		const { container } = await renderBreadcrumb([{ label: "Dashboard" }]);
		expect(container.querySelector("nav")).toBeNull();
	});

	it("returns null when segments is empty", async () => {
		const { container } = await renderBreadcrumb([]);
		expect(container.querySelector("nav")).toBeNull();
	});

	it("renders multiple segments with separators", async () => {
		await renderBreadcrumb([
			{ label: "Transactions", href: "/transactions" },
			{ label: "Main Bank" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		expect(nav).toBeInTheDocument();
		expect(within(nav).getByText("Transactions")).toBeInTheDocument();
		expect(within(nav).getByText("Main Bank")).toBeInTheDocument();
	});

	it('renders last segment as non-clickable with aria-current="page"', async () => {
		await renderBreadcrumb([
			{ label: "Transactions", href: "/transactions" },
			{ label: "Main Bank" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		const currentPage = within(nav).getByText("Main Bank");
		expect(currentPage).toHaveAttribute("aria-current", "page");
		expect(currentPage.tagName).toBe("SPAN");
	});

	it("renders earlier segments as links", async () => {
		await renderBreadcrumb([
			{ label: "Transactions", href: "/transactions" },
			{ label: "Main Bank" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		const link = within(nav).getByRole("link", {
			name: "Transactions",
			hidden: true,
		});
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "/transactions");
	});

	it("renders semantic nav > ol > li structure", async () => {
		await renderBreadcrumb([
			{ label: "Merchants", href: "/merchants" },
			{ label: "Amazon" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		const list = nav.querySelector("ol");
		expect(list).toBeInTheDocument();
		const items = list!.querySelectorAll("li");
		expect(items).toHaveLength(2);
	});

	it("renders chevron separators between segments", async () => {
		await renderBreadcrumb([
			{ label: "Merchants", href: "/merchants" },
			{ label: "Amazon" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		const svgs = nav.querySelectorAll("svg");
		expect(svgs.length).toBeGreaterThanOrEqual(1);
	});

	it("truncates when more than 3 segments", async () => {
		await renderBreadcrumb([
			{ label: "Dashboard", href: "/" },
			{ label: "Transactions", href: "/transactions" },
			{ label: "Main Bank", href: "/transactions?account=1" },
			{ label: "January 2026" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		expect(within(nav).getByText("Dashboard")).toBeInTheDocument();
		expect(within(nav).getByText("...")).toBeInTheDocument();
		expect(within(nav).getByText("January 2026")).toBeInTheDocument();
		expect(within(nav).queryByText("Transactions")).toBeNull();
	});

	it("shows hidden segments on click of truncation indicator", async () => {
		const user = userEvent.setup();
		await renderBreadcrumb([
			{ label: "Dashboard", href: "/" },
			{ label: "Transactions", href: "/transactions" },
			{ label: "Main Bank", href: "/transactions?account=1" },
			{ label: "January 2026" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		const ellipsis = within(nav).getByText("...");
		await user.click(ellipsis);

		expect(within(nav).getByText("Transactions")).toBeInTheDocument();
		expect(within(nav).getByText("Main Bank")).toBeInTheDocument();
		expect(within(nav).queryByText("...")).toBeNull();
	});

	it("has responsive classes for mobile hiding", async () => {
		await renderBreadcrumb([
			{ label: "Merchants", href: "/merchants" },
			{ label: "Amazon" },
		]);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		expect(nav.className).toContain("hidden");
		expect(nav.className).toContain("md:flex");
	});

	it("applies custom className", async () => {
		await renderBreadcrumb(
			[{ label: "Merchants", href: "/merchants" }, { label: "Amazon" }],
			"my-custom-class",
		);

		const nav = screen.getByRole("navigation", {
			name: "Breadcrumb",
			hidden: true,
		});
		expect(nav.className).toContain("my-custom-class");
	});
});
