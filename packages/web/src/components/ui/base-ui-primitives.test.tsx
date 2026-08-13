import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

/**
 * The primitives mamen renders on **Base UI**, asserted at the boundary a test
 * runner can actually reach. `Tooltip` was the first (issue #99), `Dialog` the
 * second (issue #100) and `Popover` the third and widest (issue #101) — which
 * closed the seam ADR 0003 describes: no gap-fill is on Radix any more.
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
 * **Why the server render is the boundary** for the two pointer-driven ones.
 * Everything else about a tooltip or a popover lives in a portal that is mounted
 * in an effect — `renderToStaticMarkup` emits nothing for it, and jsdom mounts
 * it but cannot lay it out, hover it, or report what a screen reader would
 * announce. So the *presence* of the floating content in the markup is
 * assertable (it must not be there while closed) and its behaviour is not. The
 * dialog is the exception: it is rendered from state rather than from a pointer,
 * so jsdom mounts the whole thing and its own describe reaches further.
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
 * tooltip reveals is only available there. Neither of the other two has such a
 * gap: the popover's popup is a `role="dialog"` Base UI wires to the trigger
 * both ways, and the dialog kept its role, labelling, focus trap and dismissal
 * wholesale.
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

/**
 * The one dialog shape mamen uses: **controlled** — all three consumers own the
 * open state themselves and render no trigger — with a title and a line of copy.
 * The trigger is exercised separately because the primitive still exports one.
 */
function DialogFixture({ open }: { open?: boolean }) {
	return (
		<Dialog open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit issuer</DialogTitle>
					<DialogDescription>Rename it, or move it.</DialogDescription>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
}

/**
 * The same dialog opened by its own trigger, uncontrolled. No consumer is shaped
 * like this — all three are controlled from outside — but focus has to come from
 * somewhere for "it goes back where it was" to mean anything, and this is the
 * shape the primitive's own `DialogTrigger` is for. It also holds a field, so
 * there is something inside the panel for focus to land on that isn't the close
 * button.
 */
function TriggeredDialogFixture() {
	return (
		<Dialog>
			<DialogTrigger>Edit issuer</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit issuer</DialogTitle>
					<DialogDescription>Rename it, or move it.</DialogDescription>
				</DialogHeader>
				<input aria-label="Name" />
			</DialogContent>
		</Dialog>
	);
}

/**
 * `Dialog` is the second primitive to move (issue #100), and unlike the tooltip
 * a test runner can reach most of it: the panel is portalled but it is rendered
 * from state rather than from a pointer, so jsdom mounts the whole thing.
 *
 * The server render is still asserted first, because it is the half that must
 * emit *nothing*: Base UI's portal is client-only, so a closed dialog costs no
 * markup and an open one costs no markup either. Anything the shell needs on the
 * first paint therefore cannot live inside a dialog.
 *
 * What jsdom adds over the tooltip is the panel's wiring — its role, the ids
 * that label and describe it, and the state attribute the entrance animation is
 * written against. That last one is the seam this slice actually moves: Base UI
 * spells the open state `data-open`/`data-ending-style` where Radix spelled it
 * `data-state="open"`, and a class left on the old spelling would style nothing
 * while every other test stayed green.
 *
 * Focus and dismissal turned out to be reachable here too, so they are asserted
 * rather than left to a human: jsdom has a focus model and dispatches keys and
 * clicks, and Base UI's focus manager runs on both. They are the behaviours a
 * dialog exists for, and they are entirely the primitive's — nothing in mamen's
 * code would go red if an upgrade dropped them.
 *
 * **Left to manual acceptance**, in a browser: that the page behind the panel
 * stops scrolling (Base UI locks it in CSS, which jsdom does not compute), that
 * the panel is actually centred over the backdrop, and that the scale-and-fade
 * entrance plays — jsdom runs no animations and has no layout.
 */
describe("the Base UI dialog", () => {
	it("costs the server render nothing while closed", () => {
		expect(renderToStaticMarkup(<DialogFixture open={false} />)).toBe("");
	});

	it("costs it nothing when open either — the panel is portalled client-side", () => {
		const markup = renderToStaticMarkup(<DialogFixture open />);

		expect(markup).not.toContain("Edit issuer");
		expect(markup).not.toContain("Rename it, or move it.");
	});

	it("renders its trigger as a real button, so a keyboard can reach it", () => {
		const markup = renderToStaticMarkup(
			<Dialog>
				<DialogTrigger>Edit</DialogTrigger>
				<DialogContent>
					<DialogTitle>Edit issuer</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		expect(markup).toMatch(/^<button [^>]*type="button"/);
	});

	it("mounts a panel labelled by its title and described by its copy", () => {
		render(<DialogFixture open />);

		const panel = screen.getByRole("dialog", { name: "Edit issuer" });
		expect(panel.getAttribute("aria-describedby")).toBe(
			screen.getByText("Rename it, or move it.").id,
		);
	});

	it("stamps the panel and the backdrop with the state its animation reads", () => {
		render(<DialogFixture open />);

		const panel = screen.getByRole("dialog");
		const backdrop = document.querySelector<HTMLElement>(
			"[class*='bg-black/']",
		);

		expect(panel.hasAttribute("data-open")).toBe(true);
		expect(backdrop?.hasAttribute("data-open")).toBe(true);
		// The other half of that pair: a rule still written against Radix's
		// `data-state` would match nothing, and nothing else here would notice.
		expect(panel.className).not.toContain("data-[state=");
		expect(backdrop?.className).not.toContain("data-[state=");
	});

	it("takes the panel back out of the document when it closes", () => {
		const { rerender } = render(<DialogFixture open />);
		expect(screen.getByRole("dialog")).toBeTruthy();

		rerender(<DialogFixture open={false} />);

		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("sends focus into the panel, and back to the opener on Escape", async () => {
		const user = userEvent.setup();
		render(<TriggeredDialogFixture />);
		const trigger = screen.getByRole("button", { name: "Edit issuer" });

		await user.click(trigger);
		const panel = await screen.findByRole("dialog");
		expect(panel.contains(document.activeElement)).toBe(true);

		await user.keyboard("{Escape}");

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		// Not merely "focus left the panel": a dismissed dialog that drops focus on
		// the body strands the keyboard at the top of the document.
		expect(document.activeElement).toBe(trigger);
	});

	it("dismisses on a click on the backdrop", async () => {
		const user = userEvent.setup();
		render(<TriggeredDialogFixture />);
		await user.click(screen.getByRole("button", { name: "Edit issuer" }));
		await screen.findByRole("dialog");

		const backdrop = document.querySelector<HTMLElement>(
			"[class*='bg-black/']",
		);
		await user.click(backdrop as HTMLElement);

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
 * Which primitives sit on which library was the seam ADR 0003 describes, and it
 * only narrowed: #99 moved `Tooltip`, #100 `Dialog`, #101 `Popover` — and with
 * the third there was no gap-fill left on the old one at all, which is what
 * ADR 0004 records. Asserted as text because there is nothing to render: a
 * later change could re-implement one of these three on something else and
 * every behavioural test above would still pass.
 *
 * The negative half of the claim — that the retired package is named by no
 * manifest and no source file in the repo — lives in
 * `src/test/radix-package-removed.test.ts`, which is wider than `src` and is
 * the one file allowed to spell the package out. Paths here are cwd-relative:
 * vitest runs from the package root.
 */
const read = (path: string) => readFileSync(path, "utf8");

describe("the three converted primitives", () => {
	it("are each rendered on Base UI", () => {
		for (const name of ["tooltip", "dialog", "popover"]) {
			expect(read(`src/components/ui/${name}.tsx`)).toContain(
				"@base-ui-components/react",
			);
		}
	});
});
