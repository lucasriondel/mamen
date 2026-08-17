import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	type SidebarCollapsedContextValue,
	SidebarCollapsedProvider,
} from "@/lib/sidebar-collapsed-context";
import { PageLayout } from "./page-layout";

/**
 * The shared page layout: the topbar row every page's title, reopen trigger and
 * own actions sit in (issue #125).
 *
 * The collapse flag is `AppShell`'s, handed down through the sidebar-collapsed
 * context — so it is faked here rather than driven, and what is asserted is the
 * layout's half of that contract: which controls exist in which state, that the
 * trigger calls the shell's toggle, and that the shell's ref reaches the button
 * it has to hand focus to. The focus handoff itself is the shell's, and is
 * asserted there against this layout.
 */

function shell(
	overrides: Partial<SidebarCollapsedContextValue> = {},
): SidebarCollapsedContextValue {
	return {
		collapsed: false,
		toggle: () => {},
		triggerRef: createRef<HTMLButtonElement>(),
		...overrides,
	};
}

function renderLayout(
	ui: React.ReactElement,
	value: SidebarCollapsedContextValue = shell(),
) {
	return render(
		<SidebarCollapsedProvider value={value}>{ui}</SidebarCollapsedProvider>,
	);
}

/** The row the title, the trigger and the page's actions share. */
const topbar = (title: string) =>
	screen.getByRole("heading", { name: title }).closest("header") as HTMLElement;

const trigger = () => screen.queryByRole("button", { name: "Open sidebar" });

describe("PageLayout", () => {
	it("puts the page's title in the topbar", () => {
		renderLayout(<PageLayout title="Accounts" />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Accounts" }),
		).toBeInTheDocument();
	});

	it("renders no trigger while the sidebar is open — there is nothing to re-open", () => {
		renderLayout(<PageLayout title="Accounts" />, shell({ collapsed: false }));

		expect(trigger()).toBeNull();
	});

	it("renders the trigger beside the title once the sidebar is collapsed", () => {
		renderLayout(<PageLayout title="Accounts" />, shell({ collapsed: true }));

		// In the topbar, not a bar of its own: the trigger is a flex sibling of the
		// heading, so it can never overlap it or shift the page below.
		expect(
			within(topbar("Accounts")).getByRole("button", {
				name: "Open sidebar",
			}),
		).toBeInTheDocument();
	});

	it("re-opens the panel through the shell's own toggle", async () => {
		const user = userEvent.setup();
		const toggle = vi.fn();
		renderLayout(
			<PageLayout title="Accounts" />,
			shell({ collapsed: true, toggle }),
		);

		await user.click(trigger() as HTMLElement);

		// The flag stays the shell's — this layout only drives it.
		expect(toggle).toHaveBeenCalledTimes(1);
	});

	it("hands the shell its trigger, so focus can follow the control", () => {
		const triggerRef = createRef<HTMLButtonElement>();
		renderLayout(
			<PageLayout title="Accounts" />,
			shell({ collapsed: true, triggerRef }),
		);

		expect(triggerRef.current).toBe(trigger());
	});

	it("renders a page's own actions in the topbar, beside the title", () => {
		renderLayout(
			<PageLayout title="Issuers" actions={<button type="button">New</button>}>
				<p>body</p>
			</PageLayout>,
		);

		expect(
			within(topbar("Issuers")).getByRole("button", { name: "New" }),
		).toBeInTheDocument();
	});

	it("renders no way back on a page that has none to name", () => {
		renderLayout(<PageLayout title="Accounts" />);

		expect(screen.queryByRole("link")).toBeNull();
	});

	it("renders a drill-down's way back above the title row", () => {
		renderLayout(
			<PageLayout title="Groceries" back={<a href="/categories">Categories</a>}>
				<p>body</p>
			</PageLayout>,
		);

		const back = within(topbar("Groceries")).getByRole("link", {
			name: "Categories",
		});
		const heading = screen.getByRole("heading", { name: "Groceries" });
		// Above the title, not beside it: it is the way out of this page, not one
		// of its actions.
		expect(back.compareDocumentPosition(heading)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("keeps the trigger reachable on a page that has a way back", () => {
		renderLayout(
			<PageLayout
				title="Groceries"
				back={<a href="/categories">Categories</a>}
			/>,
			shell({ collapsed: true }),
		);

		expect(trigger()).not.toBeNull();
	});

	it("renders the title's description under it, and the page under both", () => {
		renderLayout(
			<PageLayout
				title="Accounts"
				description="The accounts your statements belong to."
			>
				<p>body</p>
			</PageLayout>,
		);

		expect(
			within(topbar("Accounts")).getByText(
				"The accounts your statements belong to.",
			),
		).toBeInTheDocument();
		// The page itself is outside the topbar — a layout, not a header.
		expect(within(topbar("Accounts")).queryByText("body")).toBeNull();
		expect(screen.getByText("body")).toBeInTheDocument();
	});

	it("takes the page's own width and rhythm without losing its own", () => {
		const { container } = renderLayout(
			<PageLayout title="Accounts" className="mx-auto max-w-4xl gap-8" />,
		);

		const section = container.querySelector("section") as HTMLElement;
		// Tailwind-merged, so a page can widen or re-space itself without having to
		// restate the column the layout is.
		expect(section).toHaveClass("mx-auto", "max-w-4xl", "gap-8", "flex-col");
		expect(section).not.toHaveClass("gap-6");
	});
});
