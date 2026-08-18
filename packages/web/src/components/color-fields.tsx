import { type KeyboardEvent, useRef, useState } from "react";
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
  const full = digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits;
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
 * A **roving `tabIndex`**, as in {@link IconGrid}: the whole grid is one tab
 * stop and the arrows walk it in two dimensions. Twenty-four tab stops between
 * the panel opening and the spectrum below it would make the keyboard path
 * through this panel worse than the mouse one, which is the opposite of the
 * point.
 *
 * The cell the grid *starts* on is the one the stored colour already sits on, or
 * the first — so arriving here by Tab lands on the current colour rather than on
 * a red the category never chose.
 */
export function PaletteGrid({
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
  const [active, setActive] = useState(selectedIndex === -1 ? 0 : selectedIndex);
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
    const swatches = gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-palette-swatch]");
    swatches?.[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-gousse-muted text-xs uppercase tracking-wide">Palette</span>
      {/* Two linters, one decision, and each wants its directive on the line
          directly above — so oxlint's is a block and biome's keeps the slot. */}
      {/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- the arrows are handled here because a roving `tabIndex` leaves one cell focusable at a time */}
      {/* biome-ignore lint/a11y/useSemanticElements: a grid of swatches is a group of buttons, not a listbox — each cell stays a real button so Enter and Space pick it. */}
      <div
        ref={gridRef}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the same decision as the biome-ignore above, for the other linter
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
      {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions */}
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
export function SpectrumArea({
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
      <span className="text-gousse-muted text-xs uppercase tracking-wide">Spectrum</span>
      {/* No element carries two axes, so the area is a `slider` with both in
          `aria-valuetext` — see the note above. */}
      <div
        ref={areaRef}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an `input[type=range]` carries one axis; this control is two, which is the whole reason it is not one
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
        onChange={(event) => onChange({ ...hsv, h: Number(event.target.value) })}
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
