import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InboxZeroEmpty } from "./index";

function renderWithRouter(
	component: () => React.ReactElement,
): ReturnType<typeof render> {
	const rootRoute = createRootRoute({ component });

	const dashboardRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <div>Dashboard</div>,
	});

	const routeTree = rootRoute.addChildren([dashboardRoute]);

	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/test"] }),
	});

	return render(<RouterProvider router={router} />);
}

describe("InboxZeroEmpty", () => {
	it("renders the celebration heading", async () => {
		renderWithRouter(() => <InboxZeroEmpty />);

		expect(await screen.findByText("All caught up!")).toBeInTheDocument();
	});

	it("renders descriptive message", async () => {
		renderWithRouter(() => <InboxZeroEmpty />);

		expect(
			await screen.findByText("Every transaction has a merchant."),
		).toBeInTheDocument();
	});

	it("renders View Dashboard CTA", async () => {
		renderWithRouter(() => <InboxZeroEmpty />);

		const link = await screen.findByRole("link", { name: /view dashboard/i });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "/");
	});

	it("has role=status for screen reader announcement", async () => {
		renderWithRouter(() => <InboxZeroEmpty />);

		expect(await screen.findByRole("status")).toBeInTheDocument();
	});

	it("CTA button is focusable", async () => {
		renderWithRouter(() => <InboxZeroEmpty />);

		const link = await screen.findByRole("link", { name: /view dashboard/i });
		link.focus();
		expect(document.activeElement).toBe(link);
	});
});
