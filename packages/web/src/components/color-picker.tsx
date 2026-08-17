import {
	type FormEvent,
	type KeyboardEvent,
	useId,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Three or six hex digits, with or without the hash. Named CSS colours and
 * `rgb()` are deliberately out: the value is stored raw and painted straight
 * onto an svg `stroke`, so one canonical spelling keeps "is this the colour my
 * parent has?" a string comparison — which is exactly what migration 0015's
 * copied-colour predicate does (issue #55).
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The typed text as a storable colour, or `null` if it isn't one. Lower-cased so
 * `#EF4444` and `#ef4444` are one value rather than two rows that look identical
 * and compare unequal.
 */
export function normaliseHex(input: string): string | null {
	const trimmed = input.trim();
	const hashed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return HEX.test(hashed) ? hashed.toLowerCase() : null;
}

/**
 * A point in the spectrum: hue in degrees, saturation and brightness in `0..1`.
 *
 * The spectrum's own state, *not* a second spelling of the colour — the hex is
 * the only thing stored. Saturation and brightness are kept as floats rather
 * than whole percents because rounding them to integers loses colours: `#ef4444`
 * is 93.7% bright, and a picker that could not hold that would hand back
 * `#f04444` for a colour nobody touched.
 */
export interface Hsv {
	h: number;
	s: number;
	v: number;
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

/**
 * A stored colour as a point in the spectrum. Anything unparseable reads as
 * black, so the area always has somewhere to stand.
 */
export function hexToHsv(input: string): Hsv {
	const hex = normaliseHex(input) ?? "#000000";
	const digits = hex.slice(1);
	const full =
		digits.length === 3
			? digits.replace(/./g, (digit) => digit + digit)
			: digits;
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const chroma = max - min;

	// A grey has no hue to recover — every channel is the maximum — so it reports
	// 0 rather than a division by zero. The picker keeps the hue it was on.
	let h = 0;
	if (chroma !== 0) {
		if (max === r) h = 60 * (((g - b) / chroma) % 6);
		else if (max === g) h = 60 * ((b - r) / chroma + 2);
		else h = 60 * ((r - g) / chroma + 4);
		if (h < 0) h += 360;
	}

	return { h, s: max === 0 ? 0 : chroma / max, v: max / 255 };
}

/**
 * A point in the spectrum as a colour in the canonical spelling — six lower-case
 * digits, exactly what {@link normaliseHex} would return. Out-of-range input is
 * clamped rather than refused: the arrows and the pointer both walk off the edge
 * of the area, and the colour there is the edge.
 */
export function hsvToHex({ h, s, v }: Hsv): string {
	const hue = ((h % 360) + 360) % 360;
	const sat = clamp(s);
	const val = clamp(v);

	const chroma = val * sat;
	const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const base = val - chroma;
	const rgb: readonly [number, number, number] =
		hue < 60
			? [chroma, second, 0]
			: hue < 120
				? [second, chroma, 0]
				: hue < 180
					? [0, chroma, second]
					: hue < 240
						? [0, second, chroma]
						: hue < 300
							? [second, 0, chroma]
							: [chroma, 0, second];

	return `#${rgb
		.map((channel) =>
			Math.round((channel + base) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/**
 * How many swatches a palette row holds — the grid is uniform. Restated as
 * `grid-cols-6` on the grid itself, since Tailwind cannot build a class from a
 * variable; the two have to agree or `ArrowDown` lands on the wrong row.
 */
const PALETTE_COLUMNS = 6;

/**
 * The palette the popover opens on: six hues in three tones, then a row of
 * accents and neutrals (issue #128). Named rather than listed by hex, because
 * the name is what a screen reader announces and what a user picking a colour
 * for *Groceries* is actually choosing — the hex is the storage detail.
 *
 * Every entry is written in the canonical spelling {@link normaliseHex}
 * produces, so a palette pick and the same colour typed into the field are one
 * value. `PALETTE` is exported so its own test can hold that.
 */
export const PALETTE = [
	{ name: "Red", hex: "#ef4444" },
	{ name: "Orange", hex: "#f97316" },
	{ name: "Amber", hex: "#f59e0b" },
	{ name: "Green", hex: "#22c55e" },
	{ name: "Sky", hex: "#0ea5e9" },
	{ name: "Violet", hex: "#8b5cf6" },

	{ name: "Deep red", hex: "#b91c1c" },
	{ name: "Deep orange", hex: "#c2410c" },
	{ name: "Deep amber", hex: "#b45309" },
	{ name: "Deep green", hex: "#15803d" },
	{ name: "Deep sky", hex: "#0369a1" },
	{ name: "Deep violet", hex: "#6d28d9" },

	{ name: "Pale red", hex: "#fca5a5" },
	{ name: "Pale orange", hex: "#fdba74" },
	{ name: "Pale amber", hex: "#fcd34d" },
	{ name: "Pale green", hex: "#86efac" },
	{ name: "Pale sky", hex: "#7dd3fc" },
	{ name: "Pale violet", hex: "#c4b5fd" },

	{ name: "Pink", hex: "#ec4899" },
	{ name: "Teal", hex: "#14b8a6" },
	{ name: "Lime", hex: "#84cc16" },
	{ name: "Slate", hex: "#64748b" },
	{ name: "Grey", hex: "#94a3b8" },
	{ name: "Ink", hex: "#1e293b" },
] as const satisfies readonly { name: string; hex: string }[];

export interface ColorPickerProps {
	/** The thing being recoloured — names the trigger, e.g. "Change Food colour". */
	label: string;
	/** The category's **own** `color`; `null` = it inherits (ADR 0006). */
	value: string | null;
	/** Its **Resolved colour** — what the swatch paints, stored or inherited. */
	resolved: string;
	/** A write is in flight; the form stays open but won't fire a second one. */
	pending?: boolean;
	/** `null` clears the stored colour, resuming inheritance. */
	onSubmit: (color: string | null) => void;
	className?: string;
}

/** Where each arrow key moves within the palette grid. */
const PALETTE_ARROWS: Record<string, number | undefined> = {
	ArrowRight: 1,
	ArrowLeft: -1,
	ArrowDown: PALETTE_COLUMNS,
	ArrowUp: -PALETTE_COLUMNS,
};

/**
 * The swatch grid — the common case, one click away.
 *
 * A **roving `tabIndex`**, as in {@link IconPicker}: the whole grid is one tab
 * stop and the arrows walk it in two dimensions. Twenty-four tab stops between
 * the popover opening and the spectrum below it would make the keyboard path
 * through this panel worse than the mouse one, which is the opposite of the
 * point.
 *
 * It also decides where the popover *opens*: Base UI focuses the first tabbable
 * element in the panel, and that is this grid's active cell — the swatch the
 * stored colour already sits on, or the first one. The hex field is the escape
 * hatch now, so it no longer takes focus on open.
 */
function PaletteGrid({
	selected,
	pending,
	onPick,
}: {
	/** The draft's colour, canonically spelled — which cell reads as chosen. */
	selected: string | null;
	pending?: boolean;
	onPick: (hex: string) => void;
}) {
	const selectedIndex = PALETTE.findIndex((entry) => entry.hex === selected);
	const [active, setActive] = useState(
		selectedIndex === -1 ? 0 : selectedIndex,
	);
	const gridRef = useRef<HTMLDivElement>(null);

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const delta = PALETTE_ARROWS[event.key];
		if (delta === undefined) return;
		const next = active + delta;
		// Clamped, not wrapped: a row-end wrap would move the eye somewhere the
		// arrow did not point.
		if (next < 0 || next >= PALETTE.length) return;
		event.preventDefault();
		setActive(next);
		gridRef.current
			?.querySelectorAll<HTMLButtonElement>("[data-palette-swatch]")
			[next]?.focus();
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="text-gousse-muted text-xs uppercase tracking-wide">
				Palette
			</span>
			{/* biome-ignore lint/a11y/useSemanticElements: a grid of swatches is a group of buttons, not a listbox — each cell stays a real button so Enter and Space pick it. */}
			<div
				ref={gridRef}
				role="group"
				aria-label="Colour palette"
				onKeyDown={handleKeyDown}
				className="grid grid-cols-6 gap-2"
			>
				{PALETTE.map((entry, index) => {
					const isSelected = entry.hex === selected;
					return (
						<button
							key={entry.hex}
							type="button"
							data-palette-swatch={entry.hex}
							aria-label={entry.name}
							title={entry.name}
							aria-pressed={isSelected}
							disabled={pending}
							tabIndex={index === active ? 0 : -1}
							onFocus={() => setActive(index)}
							onClick={() => onPick(entry.hex)}
							style={{ backgroundColor: entry.hex }}
							className={cn(
								"size-6 cursor-pointer rounded-full border outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel disabled:opacity-50",
								isSelected
									? "border-gousse-ink ring-2 ring-gousse-ink ring-offset-1 ring-offset-gousse-panel"
									: "border-gousse-line",
							)}
						/>
					);
				})}
			</div>
		</div>
	);
}

/** How far one arrow press moves across the area, and one with Shift held. */
const SPECTRUM_STEP = 0.01;
const SPECTRUM_COARSE = 0.1;

/** The hue wheel, laid flat — the track a user drags along. */
const HUE_TRACK =
	"linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)";

/**
 * The spectrum: a saturation/brightness area over a hue track, for the colour
 * the palette does not have (issue #128).
 *
 * The area is **one focusable control**, not two. `role="slider"` has a single
 * `aria-valuenow` to spend — saturation gets it, since that is the axis the
 * arrows most obviously move — and both axes are announced through
 * `aria-valuetext`. The alternative, two visually hidden range inputs behind the
 * gradient, buys a second `valuenow` at the cost of a control that is invisible
 * to the pointer sitting on top of one that is invisible to the keyboard.
 *
 * Hue stays a **native range input**: it is a genuine one-dimensional slider, so
 * the platform's own keyboard, touch and AT behaviour is better than any
 * re-implementation.
 */
function SpectrumArea({
	hsv,
	pending,
	onChange,
}: {
	hsv: Hsv;
	pending?: boolean;
	onChange: (next: Hsv) => void;
}) {
	const areaRef = useRef<HTMLDivElement>(null);

	/** The point under the pointer, as a place in the area. */
	const pointAt = (clientX: number, clientY: number) => {
		const rect = areaRef.current?.getBoundingClientRect();
		// An unmeasured box (no layout yet) would put every point at the same
		// corner, which is worse than ignoring the gesture.
		if (!rect || rect.width === 0 || rect.height === 0) return;
		onChange({
			h: hsv.h,
			s: clamp((clientX - rect.left) / rect.width),
			// Brightness runs bottom-up: the top edge is the bright one.
			v: clamp(1 - (clientY - rect.top) / rect.height),
		});
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (pending) return;
		const step = event.shiftKey ? SPECTRUM_COARSE : SPECTRUM_STEP;
		switch (event.key) {
			case "ArrowLeft":
				onChange({ ...hsv, s: clamp(hsv.s - step) });
				break;
			case "ArrowRight":
				onChange({ ...hsv, s: clamp(hsv.s + step) });
				break;
			case "ArrowUp":
				onChange({ ...hsv, v: clamp(hsv.v + step) });
				break;
			case "ArrowDown":
				onChange({ ...hsv, v: clamp(hsv.v - step) });
				break;
			default:
				return;
		}
		// Only once a key was ours: the popover still needs Escape and Tab.
		event.preventDefault();
	};

	const saturation = Math.round(hsv.s * 100);
	const brightness = Math.round(hsv.v * 100);

	return (
		<div className="flex flex-col gap-2">
			<span className="text-gousse-muted text-xs uppercase tracking-wide">
				Spectrum
			</span>
			{/* No element carries two axes, so the area is a `slider` with both in
			    `aria-valuetext` — see the note above. */}
			<div
				ref={areaRef}
				role="slider"
				tabIndex={pending ? -1 : 0}
				aria-label="Saturation and brightness"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={saturation}
				aria-valuetext={`Saturation ${saturation}%, brightness ${brightness}%`}
				aria-disabled={pending}
				onKeyDown={handleKeyDown}
				onPointerDown={(event) => {
					if (pending) return;
					event.currentTarget.setPointerCapture?.(event.pointerId);
					event.currentTarget.focus();
					pointAt(event.clientX, event.clientY);
				}}
				onPointerMove={(event) => {
					// `buttons` is the drag: a hover must not repaint the category.
					if (pending || event.buttons === 0) return;
					pointAt(event.clientX, event.clientY);
				}}
				style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
				className="relative h-24 w-full cursor-crosshair touch-none rounded-xl border border-gousse-line outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel"
			>
				{/* White across, black down: the two washes that turn one hue into the
				    whole saturation/brightness plane. */}
				<span className="pointer-events-none absolute inset-0 rounded-xl bg-[linear-gradient(to_right,#ffffff,rgba(255,255,255,0))]" />
				<span className="pointer-events-none absolute inset-0 rounded-xl bg-[linear-gradient(to_top,#000000,rgba(0,0,0,0))]" />
				<span
					style={{
						left: `${saturation}%`,
						top: `${100 - brightness}%`,
						backgroundColor: hsvToHex(hsv),
					}}
					className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
				/>
			</div>
			<input
				type="range"
				min={0}
				max={360}
				step={1}
				// Whole degrees on the track, floats in state: the slider is a way *in*
				// to the hue, not the place it is kept.
				value={Math.round(hsv.h)}
				disabled={pending}
				aria-label="Hue"
				onChange={(event) =>
					onChange({ ...hsv, h: Number(event.target.value) })
				}
				style={{ background: HUE_TRACK }}
				className={cn(
					"h-3 w-full cursor-pointer appearance-none rounded-full border border-gousse-line outline-none",
					"focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel",
					"[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow",
					"[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent",
					"disabled:opacity-50",
				)}
			/>
		</div>
	);
}

/**
 * The colour editor for a category, opened by clicking the swatch it edits
 * (issue #58, rebuilt in #128). A popover holding a **palette** of swatches for
 * the common case, a **spectrum** for a colour that is not in it, and the hex
 * field as the escape hatch for a user who does have a code.
 *
 * All three drive **one draft**, and only *Save* writes. A palette click that
 * committed on the spot — the {@link AccountColorPicker}'s bargain, where the
 * grid is the whole picker — would make the spectrum unreachable as a
 * refinement of a palette pick, and would sit oddly next to a Save button it
 * ignores. So the grid stages, the spectrum stages, the field stages, and the
 * popover has exactly one commit gesture.
 *
 * The swatch shows the **Resolved colour**, never the stored one: a leaf that
 * inherits has nothing of its own to show, and showing a blank there would hide
 * the very propagation this surface exists to demonstrate. Clearing writes
 * `null` — a *reference* to the nearest coloured ancestor, not an absent value —
 * and is offered only when there is something to clear.
 *
 * An unparseable value is refused here rather than sent: `color` is a bare
 * `Schema.String` on the wire, so the server would happily store "purple-ish"
 * and every descendant inheriting it would paint nothing.
 */
export function ColorPicker({
	label,
	value,
	resolved,
	pending,
	onSubmit,
	className,
}: ColorPickerProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value ?? "");
	const [invalid, setInvalid] = useState(false);
	/**
	 * Where the spectrum is standing. Seeded from the **Resolved colour** when the
	 * category inherits: there is no stored colour to start from, and starting on
	 * black would make the first drag begin somewhere the row has never been.
	 */
	const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value ?? resolved));
	// One picker renders per tree row, so a static id would collide across rows.
	const fieldId = useId();
	const errorId = useId();

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		// Re-seed from the stored colour on every open, so a cancelled edit (Escape,
		// or clicking away) never leaks into the next one.
		if (next) {
			setDraft(value ?? "");
			setHsv(hexToHsv(value ?? resolved));
			setInvalid(false);
		}
	};

	/**
	 * The draft text, and the spectrum moved to wherever it now points. Both the
	 * field and the palette land here: a swatch click is the same event as typing
	 * that colour's code, and having two ways to reach the draft is what would let
	 * the two halves of the popover drift apart.
	 */
	const handleDraft = (next: string) => {
		setDraft(next);
		setInvalid(false);
		const hex = normaliseHex(next);
		if (hex === null) return;
		setHsv((previous) => {
			const point = hexToHsv(hex);
			// A grey carries no hue, so typing `#ffffff` would otherwise swing the
			// track to red. Keep the hue the spectrum was already on.
			return point.s === 0 ? { ...point, h: previous.h } : point;
		});
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (pending) return;
		const hex = normaliseHex(draft);
		if (hex === null) {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		onSubmit(hex);
		setOpen(false);
	};

	const clear = () => {
		if (pending) return;
		onSubmit(null);
		setOpen(false);
	};

	/** A spectrum move into the draft, already canonically spelled. */
	const moveSpectrum = (next: Hsv) => {
		setHsv(next);
		setDraft(hsvToHex(next));
		setInvalid(false);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label={`Change ${label} colour`}
						title={`Change ${label} colour`}
						className={cn(
							"shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel",
							className,
						)}
					>
						{/* A **chosen** colour is a solid dot; an **inherited** one is the
						    same dot hollowed to a ring. `color: null` is a *reference* to
						    the nearest coloured ancestor (ADR 0006), so the swatch can say
						    which without a second glyph — previously both painted
						    identically and the propagation was invisible until you edited
						    something. Both spellings paint the **Resolved colour**. */}
						<span
							data-color-swatch={resolved}
							data-color-inherited={value === null ? "" : undefined}
							style={
								value === null
									? { boxShadow: `inset 0 0 0 2px ${resolved}` }
									: { backgroundColor: resolved }
							}
							className={cn(
								"block size-3.5 rounded-full",
								value === null ? "opacity-75" : "border border-gousse-line",
							)}
						/>
					</button>
				}
			/>
			<PopoverContent className="w-64 p-3">
				<div className="flex flex-col gap-3">
					<PaletteGrid
						selected={normaliseHex(draft)}
						pending={pending}
						onPick={handleDraft}
					/>
					<SpectrumArea hsv={hsv} pending={pending} onChange={moveSpectrum} />
					<form onSubmit={handleSubmit} className="flex flex-col gap-2">
						<label
							htmlFor={fieldId}
							className="text-gousse-muted text-xs uppercase tracking-wide"
						>
							Hex colour
						</label>
						<Input
							id={fieldId}
							value={draft}
							onChange={(e) => handleDraft(e.target.value)}
							aria-invalid={invalid}
							aria-describedby={invalid ? errorId : undefined}
							placeholder="#ef4444"
							spellCheck={false}
							autoComplete="off"
						/>
						{invalid ? (
							<p id={errorId} className="text-gousse-high text-xs">
								Enter a hex colour like #ef4444.
							</p>
						) : null}
						<div className="flex items-center justify-between gap-2">
							{value === null ? (
								// Already inheriting — there is nothing to clear, so no no-op.
								<span className="text-gousse-muted text-xs">Inheriting</span>
							) : (
								<Button
									variant="ghost"
									size="sm"
									onClick={clear}
									disabled={pending}
								>
									Inherit
								</Button>
							)}
							<Button
								variant="primary"
								size="sm"
								type="submit"
								disabled={pending}
							>
								Save
							</Button>
						</div>
					</form>
				</div>
			</PopoverContent>
		</Popover>
	);
}
