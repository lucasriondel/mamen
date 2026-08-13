import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
