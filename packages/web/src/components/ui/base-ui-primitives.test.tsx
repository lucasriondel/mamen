import { readdirSync, readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

/**
 * The primitives mamen renders on **Base UI**, asserted at the boundary a test
 * runner can actually reach: the server render. `Tooltip` was the first (issue
 * #99), `Popover` the second (issue #101).
 *
 * What is checked for each is the half Base UI owns *and* reaches the DOM
 * without a browser — the trigger element, and the absence of the floating half.
 * For the tooltip: that the trigger is a real focusable `<button>` (a tooltip
 * that only opens on hover is not reachable by keyboard, so the trigger's
 * element type *is* an a11y assertion), that Base UI stamps it with the id it
 * wires the popup to, and that a caller substituting its own element through
 * `render` keeps both.
 *
 * For the popover the trigger carries more: Base UI's `useRole` gives it
 * `aria-haspopup="dialog"` and `aria-expanded`, which is the whole of what a
 * screen reader knows about a *closed* popover, and every one of the twelve call
 * sites substitutes its own element (a table cell, a toolbar `Button`, a colour
 * swatch) through `render`. That substitution is the one thing the Radix → Base
 * UI swap actually changed at the call sites, so it is what these assert.
 *
 * **Why the server render is the boundary.** Everything else about either
 * primitive lives in a portal that is mounted in an effect — `renderToStaticMarkup`
 * emits nothing for it, and jsdom mounts it but cannot lay it out, hover it, or
 * report what a screen reader would announce. So the *presence* of the floating
 * content in the markup is assertable (it must not be there while closed) and
 * its behaviour is not.
 *
 * **Left to manual acceptance**, in a browser: that hover opens the tooltip
 * after the group delay and instantly for a sibling once one is open, that
 * keyboard focus opens it too, that Escape and blur dismiss it, and that it is
 * positioned against its trigger and clears the transactions table's `overflow`.
 * For the popover: that a click opens it and an outside press, Escape or a pick
 * closes it; that focus lands inside on open and returns to the trigger on
 * close; and that each panel anchors, offsets and flips exactly where the Radix
 * one did.
 *
 * Note also that Base UI's tooltip (1.0.0-rc.0) attaches no `aria-describedby`
 * and gives the popup no `role` — its content is not in the accessibility tree
 * at all, where Radix's mirrored it into a visually hidden node. That is
 * survivable here for the one reason `tooltip.tsx` documents: nothing the
 * tooltip reveals is only available there. The popover has no such gap: its
 * popup is a `role="dialog"` that Base UI wires to the trigger both ways.
 */

/** The one tooltip shape the app uses: a trigger and a portalled label. */
function TooltipFixture({
	defaultOpen,
	trigger,
}: {
	defaultOpen?: boolean;
	trigger?: React.ReactElement<Record<string, unknown>>;
}) {
	return (
		<TooltipProvider>
			<Tooltip defaultOpen={defaultOpen}>
				<TooltipTrigger render={trigger}>Note</TooltipTrigger>
				<TooltipContent>The full note</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

describe("the Base UI tooltip", () => {
	it("renders its trigger as a real button, so a keyboard can reach it", () => {
		const markup = renderToStaticMarkup(<TooltipFixture />);

		expect(markup).toMatch(/^<button [^>]*type="button"/);
	});

	it("stamps the trigger with the id it wires the popup to", () => {
		const markup = renderToStaticMarkup(<TooltipFixture />);

		expect(markup).toMatch(/^<button [^>]*id="[^"]+"/);
	});

	it("moves that wiring onto the element a caller renders in its place", () => {
		const markup = renderToStaticMarkup(
			<TooltipFixture trigger={<span className="cell">Cell</span>} />,
		);

		expect(markup).toMatch(/^<span [^>]*class="cell"/);
		expect(markup).toMatch(/^<span [^>]*id="[^"]+"/);
		expect(markup).not.toContain("<button");
	});

	it("keeps the portalled label out of the trigger's markup while closed", () => {
		const markup = renderToStaticMarkup(<TooltipFixture />);

		expect(markup).not.toContain("The full note");
	});

	it("keeps it out even when open — the popup is client-only", () => {
		const markup = renderToStaticMarkup(<TooltipFixture defaultOpen />);

		expect(markup).not.toContain("The full note");
	});
});

/** The shape all twelve popovers share: a trigger and a portalled panel. */
function PopoverFixture({
	defaultOpen,
	trigger,
}: {
	defaultOpen?: boolean;
	trigger?: React.ReactElement<Record<string, unknown>>;
}) {
	return (
		<Popover defaultOpen={defaultOpen}>
			<PopoverTrigger render={trigger}>Columns</PopoverTrigger>
			<PopoverContent>The panel</PopoverContent>
		</Popover>
	);
}

describe("the Base UI popover", () => {
	it("renders its trigger as a real button, so a keyboard can reach it", () => {
		const markup = renderToStaticMarkup(<PopoverFixture />);

		expect(markup).toMatch(/^<button [^>]*type="button"/);
	});

	it("substitutes the element a caller renders in its place, chassis intact", () => {
		const markup = renderToStaticMarkup(
			<PopoverFixture
				trigger={<Button variant="secondary" size="sm" className="toolbar" />}
			/>,
		);

		// The caller's own classes survive alongside Base UI's own attributes,
		// rather than the trigger replacing the element or the element the trigger.
		expect(markup).toMatch(/^<button [^>]*class="[^"]*toolbar/);
		expect(markup).toMatch(/^<button [^>]*id="[^"]+"/);
		expect(markup).toContain("Columns");
	});

	it("keeps the portalled panel out of the markup while closed", () => {
		const markup = renderToStaticMarkup(<PopoverFixture />);

		expect(markup).not.toContain("The panel");
	});

	it("keeps it out even when open — the panel is client-only", () => {
		const markup = renderToStaticMarkup(<PopoverFixture defaultOpen />);

		expect(markup).not.toContain("The panel");
	});
});

/**
 * The rest of the popover's semantics arrive only once it is mounted: Base UI
 * publishes the trigger's props through its store from an effect, so the *server*
 * markup above carries no `aria-haspopup` at all where Radix's did. mamen is a
 * Vite SPA with no server render, so that costs nothing in production — but it
 * does mean the wiring has to be asserted after mount rather than in the markup.
 *
 * jsdom can reach this much: attributes, roles and whether the panel exists.
 * What it cannot reach is anything positional, which is why `data-open` is worth
 * asserting explicitly — the entrance and exit animations in `popover.tsx` are
 * keyed off it, and Radix spelled the same state `data-state="open"`.
 */
describe("the Base UI popover, once mounted", () => {
	it("wires the trigger to the popover it opens", () => {
		render(<PopoverFixture />);

		const trigger = screen.getByRole("button", { name: "Columns" });
		expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
	});

	it("leaves the panel unrendered while closed", () => {
		render(<PopoverFixture />);

		expect(screen.queryByText("The panel")).not.toBeInTheDocument();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("opens onto a dialog the animations can key off", () => {
		render(<PopoverFixture defaultOpen />);

		const panel = screen.getByRole("dialog");
		expect(panel).toHaveTextContent("The panel");
		expect(panel).toHaveAttribute("data-open");
		expect(screen.getByRole("button", { name: "Columns" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	});
});

/**
 * Which primitives sit on which library is the seam ADR 0003 describes, and it
 * only narrows: #99 moved `Tooltip`, #101 moves `Popover`, and `Dialog` is the
 * last one left. Asserted as text because there is nothing to render — a later
 * change could reach for `radix-ui` in a Base UI file and every behavioural test
 * here would still pass. Paths are cwd-relative: vitest runs from the package
 * root.
 */
const read = (path: string) => readFileSync(path, "utf8");

/** Every `.ts`/`.tsx` source file under `src`, so nothing can hide. */
function sourceFiles(): string[] {
	return readdirSync("src", { recursive: true, encoding: "utf8" })
		.filter((entry) => /\.tsx?$/.test(entry))
		.map((entry) => `src/${entry}`);
}

describe("the Radix seam", () => {
	it("no longer runs through the tooltip or the popover", () => {
		for (const name of ["tooltip", "popover"]) {
			const source = read(`src/components/ui/${name}.tsx`);

			expect(source).toContain("@base-ui-components/react");
			expect(source).not.toMatch(/from\s+"radix-ui"/);
		}
	});

	it("runs through the dialog and nothing else", () => {
		const importers = sourceFiles().filter((path) =>
			/from\s+"radix-ui"/.test(read(path)),
		);

		expect(importers).toEqual(["src/components/ui/dialog.tsx"]);
	});
});
