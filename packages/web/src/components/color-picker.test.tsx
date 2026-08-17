import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	ColorPicker,
	hexToHsv,
	hsvToHex,
	normaliseHex,
	PALETTE,
} from "./color-picker";

/**
 * The **Inherited colour** editor (issue #58 / ADR 0006). Its whole job is the
 * three-way distinction the ADR turns on: a stored colour, a *cleared* colour
 * (`null` — resume inheriting), and a value that is neither because it isn't a
 * colour at all and must never reach the server.
 */

const swatch = () => document.querySelector("[data-color-swatch]");
const hexField = () => screen.getByLabelText(/hex colour/i);
const hueSlider = () => screen.getByLabelText(/^hue$/i) as HTMLInputElement;
const spectrum = () =>
	screen.getByRole("slider", { name: /saturation and brightness/i });

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

	// The two spellings of the trigger, which is the only place the propagation is
	// visible without opening anything. Unasserted until the picker was rebuilt
	// (issue #128) — and a rewrite of this component is exactly what would lose it.
	it("spells an inherited colour as a ring and a chosen one as a dot", () => {
		const { unmount } = render(
			<ColorPicker
				label="Groceries"
				value={null}
				resolved="#ef4444"
				onSubmit={vi.fn()}
			/>,
		);

		const inherited = swatch();
		expect(inherited).toHaveAttribute("data-color-inherited", "");
		// Hollow: the colour is the ancestor's, and the ring says so.
		expect(inherited).toHaveStyle({ boxShadow: "inset 0 0 0 2px #ef4444" });
		unmount();

		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={vi.fn()}
			/>,
		);

		const chosen = swatch();
		expect(chosen).not.toHaveAttribute("data-color-inherited");
		expect(chosen).toHaveStyle({ backgroundColor: "#ef4444" });
		// Both paint the **Resolved colour**, whichever spelling they use.
		expect(chosen).toHaveAttribute("data-color-swatch", "#ef4444");
	});

	// The palette is the common case — a user picking a colour for *Groceries*
	// does not have a hex code to hand (issue #128). A swatch click stages the
	// colour rather than committing it, so the spectrum below can still refine it
	// and the popover has exactly one commit gesture.
	it("stages a palette swatch into the draft, and stores it on save", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Groceries"
				value={null}
				resolved="#94a3b8"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open("Groceries");

		await user.click(screen.getByRole("button", { name: "Red" }));

		// Staged, not sent: the hex field is the same draft the palette writes to.
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByLabelText(/hex colour/i)).toHaveValue("#ef4444");

		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(onSubmit).toHaveBeenCalledWith("#ef4444");
	});

	// Whatever the picker produces is stored through `normaliseHex`, so a palette
	// entry that was not already canonical would be a colour that compares unequal
	// to the same colour picked any other way — which is exactly what migration
	// 0015's copied-colour predicate reads as "not a copy".
	it("offers only canonically spelled palette colours", () => {
		for (const entry of PALETTE) {
			expect(normaliseHex(entry.hex)).toBe(entry.hex);
		}
		// Distinct swatches, so no two cells of the grid are the same colour.
		expect(new Set(PALETTE.map((entry) => entry.hex)).size).toBe(
			PALETTE.length,
		);
	});

	// Keyboard-operable means the palette too, and as *one* tab stop: 24 stops
	// between the popover opening and the spectrum below it would make the
	// keyboard path worse than the mouse one (the roving `tabIndex` the icon
	// picker already uses).
	it("walks the palette with the arrow keys, as one tab stop", async () => {
		render(
			<ColorPicker
				label="Food"
				value={null}
				resolved="#94a3b8"
				onSubmit={vi.fn()}
			/>,
		);
		const user = await open();

		// The palette is what the popover opens on — it is the common case.
		expect(screen.getByRole("button", { name: "Red" })).toHaveFocus();

		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("button", { name: "Orange" })).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("button", { name: "Deep orange" })).toHaveFocus();
		// Clamped at the edge rather than wrapped: the arrow pointed at nothing.
		await user.keyboard("{ArrowUp}{ArrowUp}");
		expect(screen.getByRole("button", { name: "Orange" })).toHaveFocus();

		// Enter picks the cell focus is on, and Tab leaves the grid for the
		// spectrum rather than walking the remaining 22 swatches.
		await user.keyboard("{Enter}");
		expect(hexField()).toHaveValue("#f97316");
		await user.tab();
		expect(spectrum()).toHaveFocus();
	});

	it("opens the palette on the cell the stored colour is already on", async () => {
		render(
			<ColorPicker
				label="Food"
				value="#8b5cf6"
				resolved="#8b5cf6"
				onSubmit={vi.fn()}
			/>,
		);
		await open();

		expect(screen.getByRole("button", { name: "Violet" })).toHaveFocus();
	});

	// The pointer path through the area, which is the one a mouse user takes.
	// jsdom lays nothing out, so the box is given a size — without one the
	// component refuses the gesture rather than putting every point in a corner.
	it("picks the colour under the pointer, and only while dragging", async () => {
		render(
			<ColorPicker
				label="Food"
				value="#ff0000"
				resolved="#ff0000"
				onSubmit={vi.fn()}
			/>,
		);
		await open();

		const area = spectrum();
		area.getBoundingClientRect = () =>
			({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;

		fireEvent.pointerDown(area, { clientX: 100, clientY: 0, buttons: 1 });
		// Halfway across at full brightness — red washed halfway to white.
		expect(hexField()).toHaveValue("#ff8080");

		// A hover is not a drag: no button down, nothing moves.
		fireEvent.pointerMove(area, { clientX: 0, clientY: 100, buttons: 0 });
		expect(hexField()).toHaveValue("#ff8080");

		fireEvent.pointerMove(area, { clientX: 0, clientY: 100, buttons: 1 });
		expect(hexField()).toHaveValue("#000000");
	});

	// The spectrum is the other half of issue #128: a colour that is *not* in the
	// palette, chosen by moving through hue, saturation and brightness rather than
	// by knowing its code. Hue is a native range input — keyboard support is the
	// platform's, which is why it is asserted through a change event here rather
	// than through arrow keys jsdom does not implement for it.
	it("re-hues the draft from the hue slider", async () => {
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

		// The stored colour seeds the spectrum: #ef4444 is a red, so hue sits at 0.
		expect(hueSlider().value).toBe("0");

		fireEvent.change(hueSlider(), { target: { value: "120" } });

		// Same saturation and brightness, swung to green — and spelled canonically.
		expect(hexField()).toHaveValue("#44ef44");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(onSubmit).toHaveBeenCalledWith("#44ef44");
	});

	// The saturation/brightness area is a custom control, so its keyboard support
	// is mamen's own and asserted as behaviour: one tab stop, arrows in two
	// dimensions, and the pair announced through `aria-valuetext` because a 2D
	// area has one `aria-valuenow` to spend.
	it("walks brightness with the arrow keys, and stores what it lands on", async () => {
		const onSubmit = vi.fn();
		render(
			<ColorPicker
				label="Food"
				value="#800000"
				resolved="#800000"
				onSubmit={onSubmit}
			/>,
		);
		const user = await open();

		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 100%, brightness 50%",
		);

		spectrum().focus();
		await user.keyboard("{ArrowDown}");

		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 100%, brightness 49%",
		);
		expect(hexField()).toHaveValue("#7d0000");

		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(onSubmit).toHaveBeenCalledWith("#7d0000");
	});

	it("walks saturation with the arrow keys", async () => {
		render(
			<ColorPicker
				label="Food"
				value="#800000"
				resolved="#800000"
				onSubmit={vi.fn()}
			/>,
		);
		const user = await open();

		spectrum().focus();
		await user.keyboard("{ArrowLeft}");

		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 99%, brightness 50%",
		);
		// Desaturating lifts the two dark channels off zero, and only those.
		expect(hexField()).toHaveValue("#800101");
	});

	// One draft, three ways in. A palette click that left the spectrum where it
	// was would make "pick red, then darken it" pick up someone else's hue.
	it("moves the spectrum when a palette colour is picked", async () => {
		render(
			<ColorPicker
				label="Food"
				value={null}
				resolved="#94a3b8"
				onSubmit={vi.fn()}
			/>,
		);
		const user = await open();

		await user.click(screen.getByRole("button", { name: "Sky" }));

		// #0ea5e9 sits at 199° on the wheel, near-fully saturated.
		expect(Number(hueSlider().value)).toBe(199);
		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 94%, brightness 91%",
		);
		// And the grid says which cell the draft is on.
		expect(screen.getByRole("button", { name: "Sky" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	// The escape hatch drives the other two as well, so a typed code is a place to
	// start refining from rather than a separate, disconnected value.
	it("moves the spectrum when a hex is typed", async () => {
		render(
			<ColorPicker
				label="Food"
				value="#ef4444"
				resolved="#ef4444"
				onSubmit={vi.fn()}
			/>,
		);
		const user = await open();

		await user.clear(hexField());
		await user.type(hexField(), "#00ff00");

		expect(Number(hueSlider().value)).toBe(120);
		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 100%, brightness 100%",
		);
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

/**
 * The spectrum's arithmetic. It is the only part of the picker that *invents* a
 * colour rather than echoing one, so what it invents has to come back out in the
 * one canonical spelling everything else compares against.
 */
describe("hexToHsv / hsvToHex", () => {
	it("round-trips every colour the palette offers", () => {
		for (const entry of PALETTE) {
			expect(hsvToHex(hexToHsv(entry.hex))).toBe(entry.hex);
		}
	});

	it("round-trips the greys the hue-less corners collapse to", () => {
		// Black and white have no hue and no saturation to preserve; a conversion
		// that divided by the (zero) chroma would come back NaN.
		for (const hex of ["#000000", "#ffffff", "#808080"]) {
			expect(hsvToHex(hexToHsv(hex))).toBe(hex);
		}
	});

	it("answers in the canonical six-digit lower-case spelling", () => {
		// Three digits in, six out — one colour has one storable spelling.
		expect(hsvToHex(hexToHsv("#0F0"))).toBe("#00ff00");
		expect(hsvToHex({ h: 210, s: 1, v: 1 })).toBe("#0080ff");
		expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe("#000000");
	});

	it("clamps a point pushed past the edge of the area", () => {
		// The arrow keys and the pointer both walk off the edge; the colour they
		// land on is the edge, not an out-of-range channel.
		expect(hsvToHex({ h: 0, s: 1.4, v: 1.2 })).toBe("#ff0000");
		expect(hsvToHex({ h: 400, s: -1, v: -0.5 })).toBe("#000000");
	});
});
