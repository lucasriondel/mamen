import { APP_BASE_PATH_SLASH } from "@mamen/shared";
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
 *
 * The brand row is a link of its own since #107, so every query for a nav row is
 * scoped to the `<nav>` the group renders: unscoped, `getAllByRole("link")`
 * counts the brand among the destinations.
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
	// Last, and after a rule: settings is where the app is configured rather than
	// where its money is looked at, so it sits below the feature surfaces.
	["Settings", "/settings"],
] as const;

/** Where the brand row goes: the app's root, which is its landing surface. */
const LANDING = "/";

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
	const routeTree = rootRoute.addChildren([
		// The landing surface the brand row points at. In the app it is an index
		// route that redirects onto the transactions view; here it renders, so a
		// click on the brand is observable as a navigation rather than a redirect.
		createRoute({
			getParentRoute: () => rootRoute,
			path: LANDING,
			component: () => <main>Landing page</main>,
		}),
		...DESTINATIONS.map(([label, to]) =>
			createRoute({
				getParentRoute: () => rootRoute,
				path: to,
				component: () => <main>{label} page</main>,
			}),
		),
	]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
	});
	render(<RouterProvider router={router} />);
	return router;
}

/**
 * The nav rows, in DOM order.
 *
 * Scoped to the group's `<nav>`: the brand row is a link too (#107), and it sits
 * in the header, outside it.
 */
const navItems = () =>
	within(screen.getByRole("navigation")).getAllByRole("link");

/** The brand row — a link on the app's name, at the top of the panel. */
const brandRow = () => screen.getByRole("link", { name: "mamen" });

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

	// #106: the panel's own half of the affordance. Closing is driven from inside
	// the header, opposite the brand row; the control that re-opens it belongs to
	// the top bar, outside the panel, because a collapsed sidebar has nothing left
	// to click.
	it("offers a named close control in the header, beside the brand", async () => {
		renderSidebar();

		const close = await screen.findByRole("button", {
			name: "Collapse sidebar",
		});
		// Siblings in the header, which lays the two out with `justify-between`.
		// Neither is wrapped in layout of the call site's own (#107).
		expect(close.parentElement).toBe(brandRow().parentElement);
	});

	it("hands the close control's press back to the caller", async () => {
		const user = userEvent.setup();
		const onToggle = vi.fn();
		renderSidebar("/transactions", { onToggle });

		await user.click(
			await screen.findByRole("button", { name: "Collapse sidebar" }),
		);

		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it("offers no way to re-open from inside the panel", async () => {
		renderSidebar("/transactions", { collapsed: true });

		await waitFor(() => expect(panel()).toHaveAttribute("inert"));
		// The open trigger lives in the top bar (`AppShell`). One inside the
		// collapsed panel would be inert, and so unreachable.
		expect(screen.queryByRole("button", { name: "Open sidebar" })).toBeNull();
	});
});

/**
 * The brand row (#107) — gousse's `SidebarTitle`, where the mark and the name
 * used to be an image and a span written out at this call site.
 *
 * Two things can silently come apart in that swap: the row is a router link now,
 * so it has to reach the landing surface without a reload, and the treatment it
 * gains is the primitive's — a copy of those classes left behind here is exactly
 * the drift adopting the primitive is meant to end.
 */
describe("AppSidebar, the brand row", () => {
	it("names the app, and reaches its landing surface", async () => {
		renderSidebar();

		await waitFor(() => expect(brandRow()).toHaveAttribute("href", LANDING));
	});

	it("navigates client-side, like the rows below it", async () => {
		const user = userEvent.setup();
		const router = renderSidebar("/recap");

		await waitFor(() => expect(brandRow()).toBeInTheDocument());
		await user.click(brandRow());

		await waitFor(() => expect(router.state.location.pathname).toBe(LANDING));
		expect(await screen.findByText("Landing page")).toBeInTheDocument();
	});

	it("puts the app icon in the primitive's mark slot", async () => {
		renderSidebar();

		await waitFor(() => expect(brandRow()).toBeInTheDocument());
		const icon = brandRow().querySelector("img");
		expect(icon).not.toBeNull();
		// The slot is a fixed square the primitive reserves, so the name lands on
		// the same line with or without a mark. A bare image dropped in as a child
		// of the row would still show, and would still be wrong.
		const slot = icon?.parentElement;
		expect(slot).not.toBe(brandRow());
		expect(slot).toHaveClass("grid", "shrink-0", "place-items-center");
		expect(icon).toHaveAttribute("aria-hidden");
	});

	it("points the mark at the icon where the prefix actually serves it", async () => {
		renderSidebar();

		await waitFor(() => expect(brandRow()).toBeInTheDocument());
		const icon = brandRow().querySelector("img");
		// `public/` is copied under the app's base, so `/icon-192x192.png` is a
		// path nothing serves once the SPA moves under a prefix (issue #111).
		// Vite rewrites rooted URLs in `index.html` and in CSS, but not in a
		// `src` written in TSX — that one is a string it never parses as a URL,
		// which is exactly why this is asserted rather than assumed.
		expect(icon).toHaveAttribute(
			"src",
			`${APP_BASE_PATH_SLASH}icon-192x192.png`,
		);
	});

	it("wears the primitive's accent treatment", async () => {
		renderSidebar();

		await waitFor(() => expect(brandRow()).toBeInTheDocument());
		// The visible change the issue asks for: accent-coloured, bold, tightly
		// tracked — and the whole row fading together on hover, which is why the
		// transition sits on the row rather than on the name alone.
		expect(brandRow()).toHaveClass(
			"text-gousse-accent",
			"font-bold",
			"tracking-tight",
			"hover:opacity-80",
		);
	});
});
