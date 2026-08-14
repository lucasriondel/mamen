import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

/**
 * The app's left navigation, rendered through gousse's `SidebarShell` (issues
 * #95, #105).
 *
 * The subject is the wiring the migration off the local stand-in could silently
 * break: the destinations and their order, client-side navigation, and the
 * active mark. The last one has two halves that can come apart — TanStack's
 * `Link` sets `aria-current` on its own, so a lost `activeProps` would leave the
 * row semantically active but visually identical to its siblings. Both are
 * asserted.
 *
 * Re-vendoring (#105) added the shell's own axis: `collapsed` drives the mobile
 * drawer and the desktop width-collapse off one flag, and the scrim reports back
 * through `onToggle`. jsdom computes no layout, so what is asserted here is the
 * contract the shell exposes — `inert`, the scrim's reachability, the handler —
 * rather than the pixels either breakpoint draws.
 */

/** Every destination the sidebar offers, in the order it offers them. */
const DESTINATIONS = [
	["Transactions", "/transactions"],
	["Transfers", "/transfers"],
	["Recap", "/recap"],
	["Import", "/import"],
	["Accounts", "/accounts"],
	["Issuers", "/issuers"],
	["Categories", "/categories"],
] as const;

type SidebarProps = Parameters<typeof AppSidebar>[0];

function renderSidebar(
	initialEntry = "/transactions",
	props: SidebarProps = {},
) {
	const rootRoute = createRootRoute({
		component: () => (
			<>
				<AppSidebar {...props} />
				<Outlet />
			</>
		),
	});
	const routeTree = rootRoute.addChildren(
		DESTINATIONS.map(([label, to]) =>
			createRoute({
				getParentRoute: () => rootRoute,
				path: to,
				component: () => <main>{label} page</main>,
			}),
		),
	);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
	render(<RouterProvider router={router} />);
	return router;
}

/** The nav rows, in DOM order. */
const navItems = () => screen.getAllByRole("link");

/**
 * A row's own styling, with TanStack's marker class removed.
 *
 * `Link` appends a bare `active` class to the current row whether or not
 * anything asked it to — that is its default `activeProps`. Comparing raw
 * `className` therefore finds a difference even when gousse's `active` variant
 * was never wired, which would leave the row muted like its siblings and the
 * mark invisible. Dropping the marker is what makes the comparison mean
 * "gousse's own styling flipped", and it stays honest if gousse restyles the
 * variant.
 */
const ownStyling = (row: Element) =>
	row.className
		.split(/\s+/)
		.filter((name) => name && name !== "active")
		.sort()
		.join(" ");

describe("AppSidebar", () => {
	it("offers every destination, in order, as a router link", async () => {
		renderSidebar();

		await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
		expect(
			navItems().map((item) => [item.textContent, item.getAttribute("href")]),
		).toStrictEqual(DESTINATIONS.map(([label, to]) => [label, to]));
	});

	it("marks the current route, and only it, as the current page", async () => {
		renderSidebar("/recap");

		await waitFor(() =>
			expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute(
				"aria-current",
				"page",
			),
		);
		const marked = navItems().filter(
			(item) => item.getAttribute("aria-current") === "page",
		);
		expect(marked).toHaveLength(1);
	});

	it("styles the current row apart from its siblings", async () => {
		renderSidebar("/recap");

		await waitFor(() =>
			expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute(
				"aria-current",
				"page",
			),
		);
		const active = screen.getByRole("link", { name: "Recap" });
		const inactive = screen.getByRole("link", { name: "Import" });
		expect(ownStyling(active)).not.toBe(ownStyling(inactive));
		// …and every other row is styled alike, so the mark is the odd one out
		// rather than seven variations.
		const others = navItems()
			.filter((row) => row !== active)
			.map(ownStyling);
		expect(new Set(others).size).toBe(1);
	});

	// The icon used to be a child of the row alongside the label; it is now a
	// prop the primitive places in its own slot. Losing the prop is invisible to
	// every assertion above, since an icon contributes no text.
	it("gives every row its icon", async () => {
		renderSidebar();

		await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
		const withIcon = navItems().filter((row) => row.querySelector("svg"));
		expect(withIcon).toHaveLength(DESTINATIONS.length);
	});

	it("navigates client-side, moving the mark with the route", async () => {
		const user = userEvent.setup();
		const router = renderSidebar("/transactions");

		await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
		await user.click(screen.getByRole("link", { name: "Accounts" }));

		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/accounts"),
		);
		expect(await screen.findByText("Accounts page")).toBeInTheDocument();
		await waitFor(() =>
			expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
				"aria-current",
				"page",
			),
		);
		expect(
			screen.getByRole("link", { name: "Transactions" }),
		).not.toHaveAttribute("aria-current");
	});

	it("keeps the brand and the theme toggle around the nav", async () => {
		renderSidebar();

		expect(await screen.findByText("mamen")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Switch to (light|dark) theme/ }),
		).toBeInTheDocument();
	});

	it("pins the theme toggle in the footer", async () => {
		renderSidebar();

		const toggle = await screen.findByRole("button", {
			name: /Switch to (light|dark) theme/,
		});
		// `mt-auto` is what pins the footer to the bottom of the column; asserting
		// the toggle sits inside that element is what "pinned in the footer"
		// means in a renderer that computes no layout.
		expect(toggle.closest(".mt-auto")).not.toBeNull();
	});

	it("leaves every row unhued, on the neutral resting surface", async () => {
		renderSidebar();

		await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
		// `--hue` is the primitive's per-row accent, for consumers whose rows
		// carry their own colour. mamen's destinations have none, so no row may
		// set it — the chrome sheet then falls back to the accent at rest.
		for (const row of navItems()) {
			expect(row.getAttribute("style") ?? "").not.toContain("--hue");
		}
	});
});

describe("AppSidebar, as a shell", () => {
	/** The shell itself — the panel the rows live in. */
	const panel = () => document.querySelector("aside");

	/** The mobile scrim, which is a button so it is a real dismiss target. */
	const scrim = () => screen.findByRole("button", { name: "Close sidebar" });

	it("renders the nav inside the shell, open by default", async () => {
		renderSidebar();

		await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
		expect(panel()).not.toBeNull();
		expect(panel()).not.toHaveAttribute("inert");
		expect(panel()).toContainElement(navItems()[0] as HTMLElement);
	});

	it("takes the rows out of the tab order and the a11y tree when collapsed", async () => {
		renderSidebar("/transactions", { collapsed: true });

		// One attribute carries both halves — the browser derives the tab order
		// and the a11y tree from it. jsdom implements neither effect, so the
		// attribute is the assertion.
		await waitFor(() => expect(panel()).toHaveAttribute("inert"));
	});

	it("hands the scrim's dismissal back to the caller", async () => {
		const user = userEvent.setup();
		const onToggle = vi.fn();
		renderSidebar("/transactions", { onToggle });

		await user.click(await scrim());

		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it("keeps the scrim out of the tab order while collapsed", async () => {
		renderSidebar("/transactions", { collapsed: true });

		expect(await scrim()).toHaveAttribute("tabindex", "-1");
	});
});
