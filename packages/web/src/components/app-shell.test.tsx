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
import { beforeEach, describe, expect, it } from "vitest";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "@/lib/use-sidebar-collapsed";
import { AppShell } from "./app-shell";
import { PageLayout } from "./page-layout";

/**
 * The app shell: the sidebar, the top bar that re-opens it, and the collapse
 * state both controls drive (issue #106).
 *
 * The two controls deliberately live on opposite sides of the panel — closing
 * from inside the header, re-opening from a bar outside it, because a collapsed
 * sidebar has nothing left to click. That is the wiring asserted here: which
 * control exists in which state, that each flips the flag, and that the flag
 * survives a remount.
 *
 * jsdom computes no layout, so the reflow itself is not observable; what stands
 * in for it is the shell's own contract — `inert` on the panel and the
 * `data-collapsed` mark the width transition keys off.
 *
 * The re-open trigger is not the shell's own markup: it is rendered per page, in
 * the topbar {@link PageLayout} owns (issue #125), off the flag this shell hands
 * down. So the route here renders through that layout — a bare `<p>` would test
 * a shell whose collapse no user could undo.
 */

const DESTINATION = "/transactions";

function renderShell() {
	const rootRoute = createRootRoute({
		component: () => (
			<AppShell>
				<Outlet />
			</AppShell>
		),
	});
	const routeTree = rootRoute.addChildren([
		createRoute({
			getParentRoute: () => rootRoute,
			path: DESTINATION,
			component: () => (
				<PageLayout title="Transactions">
					<p>Transactions page</p>
				</PageLayout>
			),
		}),
	]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [DESTINATION] }),
	});
	return render(<RouterProvider router={router} />);
}

/** The panel the rows live in. */
const panel = () => document.querySelector("aside");
const closeControl = () =>
	screen.getByRole("button", { name: "Collapse sidebar" });
const trigger = () => screen.queryByRole("button", { name: "Open sidebar" });
const scrim = () => screen.getByRole("button", { name: "Close sidebar" });

describe("AppShell", () => {
	beforeEach(() => window.localStorage.clear());

	it("renders the route's content beside the nav", async () => {
		renderShell();

		expect(await screen.findByText("Transactions page")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Transactions" }),
		).toBeInTheDocument();
	});

	it("opens with no trigger — there is nothing to re-open", async () => {
		renderShell();

		await screen.findByText("Transactions page");
		expect(panel()).not.toHaveAttribute("inert");
		expect(trigger()).toBeNull();
	});

	it("collapses from the header's close control, and the trigger takes over", async () => {
		const user = userEvent.setup();
		renderShell();

		await screen.findByText("Transactions page");
		await user.click(closeControl());

		// `inert` takes the rows out of the tab order and the a11y tree;
		// `data-collapsed` is what the panel's width transition keys off, which is
		// the reflow this renderer cannot measure.
		await waitFor(() => expect(panel()).toHaveAttribute("inert"));
		expect(panel()).toHaveAttribute("data-collapsed");
		expect(trigger()).not.toBeNull();
	});

	it("re-opens from the trigger, which then goes away again", async () => {
		const user = userEvent.setup();
		renderShell();

		await screen.findByText("Transactions page");
		await user.click(closeControl());
		await waitFor(() => expect(trigger()).not.toBeNull());
		await user.click(trigger() as HTMLElement);

		await waitFor(() => expect(panel()).not.toHaveAttribute("inert"));
		expect(panel()).not.toHaveAttribute("data-collapsed");
		expect(trigger()).toBeNull();
	});

	it("fades the trigger in over the sidebar's own close", async () => {
		const user = userEvent.setup();
		renderShell();

		await screen.findByText("Transactions page");
		await user.click(closeControl());

		// The trigger mounts the instant the close starts, so without this it would
		// pop into place while the panel is still closing — two motions where the
		// eye should follow one control from one place to the other. The keyframe
		// (and its reduced-motion opt-out) lives in the chrome sheet.
		await waitFor(() => expect(trigger()).toHaveClass("sidebar-toggle-in"));
	});

	it("follows the control from one place to the other, for the keyboard too", async () => {
		const user = userEvent.setup();
		renderShell();

		await screen.findByText("Transactions page");
		await user.click(closeControl());

		// The control the user just pressed is now inside an `inert` panel. Without
		// handing focus on, a keyboard user is dropped back to the top of the
		// document — the same discontinuity the fade-in exists to avoid visually.
		await waitFor(() => expect(trigger()).toHaveFocus());

		await user.click(trigger() as HTMLElement);
		await waitFor(() => expect(closeControl()).toHaveFocus());
	});

	it("leaves focus alone on a persisted collapse", async () => {
		window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
		renderShell();

		await screen.findByText("Transactions page");
		// Nothing was pressed — a page that opens by grabbing focus for a chrome
		// control steals the first keystroke of whatever the user came to do.
		expect(trigger()).not.toHaveFocus();
		expect(document.body).toHaveFocus();
	});

	it("dismisses the mobile drawer from its scrim", async () => {
		const user = userEvent.setup();
		renderShell();

		await screen.findByText("Transactions page");
		await user.click(scrim());

		await waitFor(() => expect(panel()).toHaveAttribute("inert"));
		expect(trigger()).not.toBeNull();
	});

	it("names both controls", async () => {
		const user = userEvent.setup();
		renderShell();

		await screen.findByText("Transactions page");
		// Queried by accessible name throughout — each of these would throw if the
		// control were an unlabelled icon button.
		expect(closeControl()).toBeInTheDocument();
		await user.click(closeControl());
		await waitFor(() => expect(trigger()).not.toBeNull());
	});

	it("persists the collapse across a remount", async () => {
		const user = userEvent.setup();
		const first = renderShell();

		await screen.findByText("Transactions page");
		await user.click(closeControl());
		await waitFor(() => expect(panel()).toHaveAttribute("inert"));
		first.unmount();

		renderShell();
		await waitFor(() => expect(panel()).toHaveAttribute("inert"));
		expect(trigger()).not.toBeNull();
	});

	it("opens on a persisted value it cannot read", async () => {
		window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "{ collapsed");
		renderShell();

		await screen.findByText("Transactions page");
		// No stored value may leave the user without a way to navigate.
		expect(panel()).not.toHaveAttribute("inert");
		expect(screen.getByRole("link", { name: "Transactions" })).toBeVisible();
	});
});
