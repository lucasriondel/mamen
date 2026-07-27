import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./input";

describe("Input", () => {
	it("passes native props through to the rendered input", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Input
				aria-label="Issuer name"
				placeholder="e.g. Spotify"
				maxLength={5}
				onChange={onChange}
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Issuer name" });
		expect(input).toHaveAttribute("placeholder", "e.g. Spotify");
		expect(input).toHaveAttribute("maxlength", "5");

		await user.type(input, "Spot");
		expect(onChange).toHaveBeenCalled();
		expect(input).toHaveValue("Spot");
	});

	it("defaults to a text input but lets the type be overridden", () => {
		const { rerender } = render(<Input aria-label="Field" />);
		expect(screen.getByRole("textbox", { name: "Field" })).toHaveAttribute(
			"type",
			"text",
		);

		rerender(<Input aria-label="Field" type="number" />);
		expect(screen.getByRole("spinbutton", { name: "Field" })).toHaveAttribute(
			"type",
			"number",
		);
	});

	it("forwards its ref to the DOM node", () => {
		const ref = createRef<HTMLInputElement>();
		render(<Input aria-label="Issuer name" ref={ref} />);

		expect(ref.current).toBe(screen.getByRole("textbox"));
		ref.current?.focus();
		expect(screen.getByRole("textbox")).toHaveFocus();
	});

	it("refuses input and dims itself when disabled", async () => {
		const user = userEvent.setup();
		render(<Input aria-label="Issuer name" disabled />);

		const input = screen.getByRole("textbox", { name: "Issuer name" });
		await user.type(input, "nope");

		expect(input).toBeDisabled();
		expect(input).toHaveValue("");
		expect(input.className).toContain("disabled:opacity-50");
	});

	it("carries an invalid state a form can drive from aria-invalid", () => {
		render(<Input aria-label="Issuer name" aria-invalid />);

		const input = screen.getByRole("textbox", { name: "Issuer name" });
		expect(input).toHaveAttribute("aria-invalid", "true");
		expect(input.className).toContain("aria-invalid:border-gousse-high");
	});

	it("lets a call-site class win over the default it conflicts with", () => {
		render(
			<Input aria-label="Issuer name" className="w-full bg-gousse-panel" />,
		);

		const input = screen.getByRole("textbox", { name: "Issuer name" });
		expect(input.className).toContain("bg-gousse-panel");
		expect(input.className).not.toContain("bg-gousse-bg");
		expect(input.className).toContain("w-full");
	});
});
