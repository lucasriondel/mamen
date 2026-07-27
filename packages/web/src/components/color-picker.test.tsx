import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./color-picker";

/**
 * The **Inherited colour** editor (issue #58 / ADR 0006). Its whole job is the
 * three-way distinction the ADR turns on: a stored colour, a *cleared* colour
 * (`null` — resume inheriting), and a value that is neither because it isn't a
 * colour at all and must never reach the server.
 */

const swatch = () => document.querySelector("[data-color-swatch]");

async function open(label = "Food") {
	const user = userEvent.setup();
	await user.click(
		screen.getByRole("button", { name: `Change ${label} colour` }),
	);
	await screen.findByLabelText(/hex colour/i);
	return user;
}

describe("ColorPicker", () => {
	it("shows the resolved colour on the swatch, not the stored one", () => {
		// An inheriting leaf stores nothing; the swatch still paints, in the colour
		// it resolves to — that is what makes a folder recolour visible on the row.
		render(
			<ColorPicker
				label="Groceries"
				value={null}
				resolved="#ef4444"
				onSubmit={vi.fn()}
			/>,
		);
		expect(swatch()).toHaveAttribute("data-color-swatch", "#ef4444");
	});

	it("stores a hex typed into the free input", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open();

		const field = screen.getByLabelText(/hex colour/i);
		await user.clear(field);
		await user.type(field, "#123ABC");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		// Normalised to lower case — the same colour typed two ways is one value.
		expect(onSubmit).toHaveBeenCalledWith("#123abc");
	});

	it("accepts a bare hex without the leading hash", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Food"
				value={null}
				resolved="#94a3b8"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open();

		await user.type(screen.getByLabelText(/hex colour/i), "0f0");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).toHaveBeenCalledWith("#0f0");
	});

	it("refuses an invalid hex without persisting, and says why", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open();

		const field = screen.getByLabelText(/hex colour/i);
		await user.clear(field);
		await user.type(field, "rebeccapurple");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(field).toBeInvalid();
		// The reason is reachable to assistive tech, not just painted (issue #56).
		expect(field).toHaveAccessibleDescription(/hex/i);
		// Still open — a refusal is not a dead end.
		expect(field).toBeInTheDocument();
	});

	it("clears a stored colour to null so the category resumes inheriting", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Restaurants"
				value="#000000"
				resolved="#000000"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open("Restaurants");

		await user.click(screen.getByRole("button", { name: /inherit/i }));

		expect(onSubmit).toHaveBeenCalledWith(null);
	});

	it("offers no clear gesture when the category already inherits", async () => {
		render(
			<ColorPicker
				label="Groceries"
				value={null}
				resolved="#ef4444"
				onSubmit={vi.fn()}
			/>,
		);
		await open("Groceries");

		// Nothing to clear — the menu never offers a no-op.
		expect(
			screen.queryByRole("button", { name: /inherit/i }),
		).not.toBeInTheDocument();
	});

	// Typing a hex and pressing Enter is the keyboard path through this popover;
	// reaching for the mouse to finish is not "keyboard-navigable". Implicit
	// submission targets the form's *first submit button*, so this also pins that
	// "Inherit" is not one — were it, Enter would silently clear the colour
	// instead of storing what was just typed, the exact opposite of the gesture.
	it("saves on Enter in the field, rather than clearing", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open();

		const field = screen.getByLabelText(/hex colour/i);
		await user.clear(field);
		await user.type(field, "#123abc{Enter}");

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith("#123abc");
	});

	// Clearing is not an edit of the draft, so an unparseable one must not block
	// it — a leaf typed into a corner can still be handed back to its parent.
	it("clears to null even while the draft is unparseable", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open();

		const field = screen.getByLabelText(/hex colour/i);
		await user.clear(field);
		await user.type(field, "nope");
		await user.click(screen.getByRole("button", { name: /inherit/i }));

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith(null);
	});

	it("dismisses on Escape without persisting", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open();

		await user.type(screen.getByLabelText(/hex colour/i), "{Escape}");

		await waitFor(() =>
			expect(screen.queryByLabelText(/hex colour/i)).not.toBeInTheDocument(),
		);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("re-seeds the draft from the stored colour on every open", async () => {
		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={vi.fn()}
			/>,
		);
		const user = await open();

		const field = screen.getByLabelText(/hex colour/i);
		expect(field).toHaveValue("#ef4444");

		// A cancelled edit must not leak into the next open.
		await user.clear(field);
		await user.type(field, "#000000{Escape}");
		await waitFor(() =>
			expect(screen.queryByLabelText(/hex colour/i)).not.toBeInTheDocument(),
		);

		await open();
		expect(screen.getByLabelText(/hex colour/i)).toHaveValue("#ef4444");
	});
});
