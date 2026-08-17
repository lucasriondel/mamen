import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	type Hsv,
	hexToHsv,
	hsvToHex,
	normaliseHex,
	PALETTE,
	PaletteGrid,
	SpectrumArea,
} from "./color-fields";

/**
 * The colour half of the appearance editor (issue #128, unwrapped from its own
 * popover in #130): the **palette** for the common case, the **spectrum** for a
 * colour the palette does not have, and the arithmetic that keeps whatever they
 * produce in one canonical spelling.
 *
 * Each control is exercised directly here — how the editor around them wires the
 * three into one draft is {@link AppearancePicker}'s own test, since that is
 * where the wiring lives.
 */

const spectrum = () =>
	screen.getByRole("slider", { name: /saturation and brightness/i });
const hueSlider = () => screen.getByLabelText(/^hue$/i) as HTMLInputElement;

describe("PaletteGrid", () => {
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

	// The palette is the common case — a user picking a colour for *Groceries*
	// does not have a hex code to hand. It **stages**: the colour goes up and the
	// panel stays put, so the spectrum below can still refine it.
	it("reports the swatch that was clicked, by name", async () => {
		const onPick = vi.fn();
		const user = userEvent.setup();
		render(<PaletteGrid selected={null} onPick={onPick} />);

		await user.click(screen.getByRole("button", { name: "Red" }));

		expect(onPick).toHaveBeenCalledWith("#ef4444");
	});

	it("says which cell the draft is standing on", () => {
		render(<PaletteGrid selected="#0ea5e9" onPick={vi.fn()} />);

		expect(screen.getByRole("button", { name: "Sky" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	// Keyboard-operable means the palette too, and as *one* tab stop: 24 stops
	// between the panel opening and the spectrum below it would make the keyboard
	// path worse than the mouse one (the roving `tabIndex` the icon grid uses).
	it("walks the grid with the arrow keys, as one tab stop", async () => {
		const onPick = vi.fn();
		const user = userEvent.setup();
		render(<PaletteGrid selected={null} onPick={onPick} />);

		screen.getByRole("button", { name: "Red" }).focus();

		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("button", { name: "Orange" })).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("button", { name: "Deep orange" })).toHaveFocus();
		// Clamped at the edge rather than wrapped: the arrow pointed at nothing.
		await user.keyboard("{ArrowUp}{ArrowUp}");
		expect(screen.getByRole("button", { name: "Orange" })).toHaveFocus();

		// Enter picks the cell focus is on — the cells are real buttons, so the
		// grid needs no key handling of its own for that.
		await user.keyboard("{Enter}");
		expect(onPick).toHaveBeenCalledWith("#f97316");

		// One stop for 24 swatches: Tab leaves the grid rather than walking the
		// remaining 22.
		await user.tab();
		expect(document.body).toHaveFocus();
	});

	// The grid starts on the colour the category already has, so arriving by Tab
	// lands on its own colour rather than on a red it never chose.
	it("starts on the cell the stored colour sits on", async () => {
		const user = userEvent.setup();
		render(<PaletteGrid selected="#8b5cf6" onPick={vi.fn()} />);

		await user.tab();

		expect(screen.getByRole("button", { name: "Violet" })).toHaveFocus();
	});

	it("stages nothing while a write is in flight", async () => {
		const onPick = vi.fn();
		const user = userEvent.setup();
		render(<PaletteGrid selected={null} pending onPick={onPick} />);

		await user.click(screen.getByRole("button", { name: "Red" }));

		expect(onPick).not.toHaveBeenCalled();
	});
});

/**
 * The spectrum, driven through a host that holds the point: the area is a
 * controlled control — it reports where it was moved to and paints what it is
 * given — so the round trip through `hsvToHex` is what a caller actually stores.
 */
function SpectrumHost({
	from,
	pending,
	onChange,
}: {
	from: string;
	pending?: boolean;
	onChange?: (next: Hsv) => void;
}) {
	const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(from));
	return (
		<>
			<SpectrumArea
				hsv={hsv}
				pending={pending}
				onChange={(next) => {
					setHsv(next);
					onChange?.(next);
				}}
			/>
			{/* What the draft would hold — the only thing the editor stores. */}
			<output data-hex>{hsvToHex(hsv)}</output>
		</>
	);
}

const hex = () => document.querySelector("[data-hex]")?.textContent;

describe("SpectrumArea", () => {
	// The pointer path through the area, which is the one a mouse user takes.
	// jsdom lays nothing out, so the box is given a size — without one the
	// component refuses the gesture rather than putting every point in a corner.
	it("picks the colour under the pointer, and only while dragging", () => {
		render(<SpectrumHost from="#ff0000" />);

		const area = spectrum();
		area.getBoundingClientRect = () =>
			({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;

		fireEvent.pointerDown(area, { clientX: 100, clientY: 0, buttons: 1 });
		// Halfway across at full brightness — red washed halfway to white.
		expect(hex()).toBe("#ff8080");

		// A hover is not a drag: no button down, nothing moves.
		fireEvent.pointerMove(area, { clientX: 0, clientY: 100, buttons: 0 });
		expect(hex()).toBe("#ff8080");

		fireEvent.pointerMove(area, { clientX: 0, clientY: 100, buttons: 1 });
		expect(hex()).toBe("#000000");
	});

	// Hue is a native range input — keyboard support is the platform's, which is
	// why it is asserted through a change event here rather than through arrow
	// keys jsdom does not implement for it.
	it("re-hues the colour from the hue slider", () => {
		render(<SpectrumHost from="#ef4444" />);

		// The stored colour seeds the spectrum: #ef4444 is a red, so hue sits at 0.
		expect(hueSlider().value).toBe("0");

		fireEvent.change(hueSlider(), { target: { value: "120" } });

		// Same saturation and brightness, swung to green — spelled canonically.
		expect(hex()).toBe("#44ef44");
	});

	// The saturation/brightness area is a custom control, so its keyboard support
	// is mamen's own and asserted as behaviour: one tab stop, arrows in two
	// dimensions, and the pair announced through `aria-valuetext` because a 2D
	// area has one `aria-valuenow` to spend.
	it("walks brightness with the arrow keys", async () => {
		const user = userEvent.setup();
		render(<SpectrumHost from="#800000" />);

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
		expect(hex()).toBe("#7d0000");
	});

	it("walks saturation with the arrow keys", async () => {
		const user = userEvent.setup();
		render(<SpectrumHost from="#800000" />);

		spectrum().focus();
		await user.keyboard("{ArrowLeft}");

		expect(spectrum()).toHaveAttribute(
			"aria-valuetext",
			"Saturation 99%, brightness 50%",
		);
		// Desaturating lifts the two dark channels off zero, and only those.
		expect(hex()).toBe("#800101");
	});

	it("moves nothing while a write is in flight", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<SpectrumHost from="#800000" pending onChange={onChange} />);

		spectrum().focus();
		await user.keyboard("{ArrowLeft}");
		fireEvent.pointerDown(spectrum(), { clientX: 10, clientY: 10, buttons: 1 });

		expect(onChange).not.toHaveBeenCalled();
	});
});

/**
 * The spectrum's arithmetic. It is the only part of the editor that *invents* a
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
		for (const grey of ["#000000", "#ffffff", "#808080"]) {
			expect(hsvToHex(hexToHsv(grey))).toBe(grey);
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

describe("normaliseHex", () => {
	it("takes a bare hex, and lower-cases what it takes", () => {
		expect(normaliseHex("0f0")).toBe("#0f0");
		expect(normaliseHex("#123ABC")).toBe("#123abc");
		expect(normaliseHex(" #ef4444 ")).toBe("#ef4444");
	});

	it("refuses anything that is not a hex colour", () => {
		// `color` is a bare `Schema.String` on the wire, so a named colour would be
		// stored and every descendant inheriting it would paint nothing.
		expect(normaliseHex("rebeccapurple")).toBeNull();
		expect(normaliseHex("")).toBeNull();
		expect(normaliseHex("#12345")).toBeNull();
	});
});
