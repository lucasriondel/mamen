import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

/**
 * The primitives mamen renders on **Base UI**, asserted at the boundary a test
 * runner can actually reach: the server render (issue #99).
 *
 * `Tooltip` is the first of them. What is checked here is the half Base UI owns
 * and the half that reaches the DOM without a browser — the trigger element:
 * that it is a real focusable `<button>` (a tooltip that only opens on hover is
 * not reachable by keyboard, so the trigger's element type *is* an a11y
 * assertion), that Base UI stamps it with the id it wires the popup to, and
 * that a caller substituting its own element through `render` keeps both.
 *
 * **Why the server render is the boundary.** Everything else about a tooltip
 * lives in a portal that is mounted in an effect — `renderToStaticMarkup`
 * emits nothing for it, and jsdom mounts it but cannot lay it out, hover it, or
 * report what a screen reader would announce. So the *presence* of the label in
 * the markup is assertable (it must not be there while closed) and its
 * behaviour is not.
 *
 * **Left to manual acceptance**, in a browser: that hover opens the tooltip
 * after the group delay and instantly for a sibling once one is open, that
 * keyboard focus opens it too, that Escape and blur dismiss it, and that it is
 * positioned against its trigger and clears the transactions table's `overflow`.
 *
 * Note also that Base UI's tooltip (1.0.0-rc.0) attaches no `aria-describedby`
 * and gives the popup no `role` — its content is not in the accessibility tree
 * at all, where Radix's mirrored it into a visually hidden node. That is
 * survivable here for the one reason `tooltip.tsx` documents: nothing the
 * tooltip reveals is only available there.
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
