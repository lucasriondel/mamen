import type { Account } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountMultiSelect } from "./account-multi-select";
import { Command, CommandItem, CommandList } from "./command";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Skeleton } from "./skeleton";
import { Textarea } from "./textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

/**
 * The shape contract (issue #97), as the gap-fill primitives render it.
 *
 * gousse's own primitives already carry it — a control is a pill, a multi-line
 * box takes the generous corner — and these are the components mamen had to
 * write itself because the kit doesn't ship them. The rule they must agree on:
 *
 * - **controls are pills** (`rounded-full`), widened to `px-4` because a pill
 *   eats its own horizontal padding at the ends;
 * - **panels and overlays take the box corner** (`rounded-2xl`), never a pill —
 *   a container's job is to hold content, not to read as a control;
 * - **multi-line fields keep the box corner** too, since a tall pill loses its
 *   first and last lines to the arc.
 *
 * Asserted on the rendered class list rather than in a snapshot: the shape is
 * the subject, and a snapshot would go red for every unrelated class change.
 */
describe("the shape contract", () => {
	it("makes the single-line input a pill, widened for the arc", () => {
		render(<Input aria-label="Issuer name" />);

		const input = screen.getByRole("textbox", { name: "Issuer name" });
		expect(input.className).toContain("rounded-full");
		expect(input.className).toContain("px-4");
	});

	it("keeps the multi-line field on the box corner, not a pill", () => {
		render(<Textarea aria-label="Note" />);

		const textarea = screen.getByRole("textbox", { name: "Note" });
		expect(textarea.className).toContain("rounded-2xl");
		expect(textarea.className).not.toContain("rounded-full");
	});

	it("shapes a skeleton block as a pill, overridable per call-site", () => {
		const { rerender } = render(<Skeleton data-testid="block" />);
		expect(screen.getByTestId("block").className).toContain("rounded-full");

		rerender(<Skeleton data-testid="block" className="rounded-2xl" />);
		const block = screen.getByTestId("block");
		expect(block.className).toContain("rounded-2xl");
		expect(block.className).not.toContain("rounded-full");
	});

	it("gives the dialog panel the box corner and its close button a pill", () => {
		render(
			<Dialog open>
				<DialogContent>
					<DialogTitle>Edit issuer</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		const panel = screen.getByRole("dialog");
		expect(panel.className).toContain("rounded-2xl");
		expect(screen.getByRole("button", { name: "Close" }).className).toContain(
			"rounded-full",
		);
	});

	it("gives the popover surface the box corner", () => {
		render(
			<Popover open>
				<PopoverTrigger>Open</PopoverTrigger>
				<PopoverContent>
					<p>Anchored</p>
				</PopoverContent>
			</Popover>,
		);

		expect(screen.getByText("Anchored").parentElement?.className).toContain(
			"rounded-2xl",
		);
	});

	it("gives the tooltip surface the box corner", () => {
		render(
			<TooltipProvider>
				<Tooltip open>
					<TooltipTrigger>Note</TooltipTrigger>
					<TooltipContent>The full note</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		const [content] = screen.getAllByText("The full note");
		expect(content.className).toContain("rounded-2xl");
	});

	it("gives the account popover a box surface and pill rows", async () => {
		const user = userEvent.setup();
		render(
			<AccountMultiSelect
				accounts={[{ id: 1, name: "Checking" } as unknown as Account]}
				selected={[]}
				onChange={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /all accounts/i }));

		const panel = screen.getByRole("group", { name: "Filter by account" });
		expect(panel.className).toContain("rounded-2xl");
		const row = screen.getByText("Checking");
		expect(row.className).toContain("rounded-full");
		expect(row.className).toContain("px-3");
	});

	it("makes a command row a pill, widened like the sidebar's", () => {
		render(
			<Command>
				<CommandList>
					<CommandItem>Spotify</CommandItem>
				</CommandList>
			</Command>,
		);

		const item = screen.getByText("Spotify");
		expect(item.className).toContain("rounded-full");
		expect(item.className).toContain("px-3");
	});
});
