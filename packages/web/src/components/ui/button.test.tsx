import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

/**
 * The button's contract, pinned before the primitive was vendored (issue #93)
 * and unchanged by it: mamen's `size` scale, its keyboard-only focus ring and
 * its `primary` default used to live in a local adapter over the npm package;
 * they now live in the vendored component itself. Call-sites cannot tell the
 * difference, which is what these assert.
 */
describe("Button", () => {
	it("defaults to the primary variant and to type=button", () => {
		render(<Button>Save</Button>);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button).toHaveAttribute("type", "button");
		expect(button.className).toContain("bg-gousse-ink");
	});

	it("renders each of gousse's variants", () => {
		const { rerender } = render(<Button variant="secondary">Cancel</Button>);
		expect(screen.getByRole("button").className).toContain(
			"border-gousse-line",
		);

		rerender(<Button variant="ghost">Cancel</Button>);
		expect(screen.getByRole("button").className).toContain("bg-transparent");

		rerender(<Button variant="danger">Delete</Button>);
		expect(screen.getByRole("button").className).toContain("bg-gousse-high");
	});

	it("carries mamen's three-step size scale, md by default", () => {
		const { rerender } = render(<Button>Save</Button>);
		expect(screen.getByRole("button").className).toContain("h-10");

		rerender(<Button size="sm">Save</Button>);
		expect(screen.getByRole("button").className).toContain("h-8");

		rerender(<Button size="icon" aria-label="Delete" />);
		expect(screen.getByRole("button").className).toContain("size-9");
	});

	it("shows a keyboard-only focus ring", () => {
		render(<Button>Save</Button>);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button.className).toContain("focus-visible:ring-2");
		expect(button.className).toContain("focus-visible:ring-gousse-accent");
		expect(button.className).not.toContain("focus:ring-2");
	});

	it("lets a call-site class win over the size it conflicts with", () => {
		render(<Button className="h-6 w-full">Save</Button>);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button.className).toContain("h-6");
		expect(button.className).not.toContain("h-10");
		expect(button.className).toContain("w-full");
	});

	it("passes native props through and refuses clicks when disabled", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(
			<Button type="submit" disabled onClick={onClick} title="Nothing to save">
				Save
			</Button>,
		);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button).toHaveAttribute("type", "submit");
		expect(button).toHaveAttribute("title", "Nothing to save");
		expect(button).toBeDisabled();

		await user.click(button);
		expect(onClick).not.toHaveBeenCalled();
	});
});
