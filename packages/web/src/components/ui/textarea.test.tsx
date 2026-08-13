import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

/**
 * The textarea's contract, pinned before the primitive was vendored (issue
 * #93). The focus-visible ring, the disabled treatment and the `aria-invalid`
 * state were an adapter's doing — they match {@link Input}, so a textarea and
 * an input on the same form don't diverge — and are now the component's own.
 */
describe("Textarea", () => {
	it("passes native props through to the rendered textarea", async () => {
		const user = userEvent.setup();
		render(<Textarea aria-label="Notes" placeholder="Anything to remember?" />);

		const textarea = screen.getByRole("textbox", { name: "Notes" });
		expect(textarea).toHaveAttribute("placeholder", "Anything to remember?");

		await user.type(textarea, "Rent");
		expect(textarea).toHaveValue("Rent");
	});

	it("forwards its ref to the DOM node", () => {
		const ref = createRef<HTMLTextAreaElement>();
		render(<Textarea aria-label="Notes" ref={ref} />);

		expect(ref.current).toBe(screen.getByRole("textbox"));
	});

	it("shows the same keyboard-only focus ring as the input primitive", () => {
		render(<Textarea aria-label="Notes" />);

		const textarea = screen.getByRole("textbox", { name: "Notes" });
		expect(textarea.className).toContain("focus-visible:ring-2");
		expect(textarea.className).toContain("focus-visible:ring-gousse-accent");
	});

	it("refuses input and dims itself when disabled", async () => {
		const user = userEvent.setup();
		render(<Textarea aria-label="Notes" disabled />);

		const textarea = screen.getByRole("textbox", { name: "Notes" });
		await user.type(textarea, "nope");

		expect(textarea).toBeDisabled();
		expect(textarea).toHaveValue("");
		expect(textarea.className).toContain("disabled:opacity-50");
	});

	it("carries an invalid state a form can drive from aria-invalid", () => {
		render(<Textarea aria-label="Notes" aria-invalid />);

		const textarea = screen.getByRole("textbox", { name: "Notes" });
		expect(textarea).toHaveAttribute("aria-invalid", "true");
		expect(textarea.className).toContain("aria-invalid:border-gousse-high");
	});

	it("lets a call-site class win over the chrome it conflicts with", () => {
		render(
			<Textarea aria-label="Notes" className="resize-none bg-gousse-bg" />,
		);

		const textarea = screen.getByRole("textbox", { name: "Notes" });
		expect(textarea.className).toContain("bg-gousse-bg");
		expect(textarea.className).not.toContain("bg-gousse-panel");
		expect(textarea.className).toContain("resize-none");
	});
});
