import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

/**
 * The checkbox is vendored source (issue #93) rather than an npm import; it
 * carries no local adapter, so this only pins the surface its two call-sites
 * (the selection column and the **Excluded** cell) rely on.
 */
describe("Checkbox", () => {
	it("renders a native checkbox named by aria-label", () => {
		render(<Checkbox aria-label="Select all" checked readOnly />);

		const box = screen.getByRole("checkbox", { name: "Select all" });
		expect(box).toHaveAttribute("type", "checkbox");
		expect(box).toBeChecked();
	});

	it("reports a change to its call-site", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Checkbox
				aria-label="Exclude Spotify"
				checked={false}
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("checkbox", { name: "Exclude Spotify" }));
		expect(onChange).toHaveBeenCalledOnce();
	});

	it("refuses a click when disabled", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Checkbox
				aria-label="Exclude Spotify"
				checked={false}
				disabled
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("checkbox", { name: "Exclude Spotify" }));
		expect(onChange).not.toHaveBeenCalled();
	});

	it("stays on the accent token and merges a call-site class", () => {
		render(<Checkbox aria-label="Select all" className="align-middle" />);

		const box = screen.getByRole("checkbox", { name: "Select all" });
		expect(box.className).toContain("text-gousse-accent");
		expect(box.className).toContain("align-middle");
	});
});
