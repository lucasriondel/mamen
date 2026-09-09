/**
 * Colour maths for painting *on top of* user-chosen colours.
 *
 * A Category's colour is user data (ADR 0006) — any hex the picker offers, plus
 * whatever the seed shipped. Anything drawn over it therefore cannot pick its own
 * ink statically: white reads well on `#3b82f6` and disappears on `#eab308`. This
 * module answers "which of my two inks survives on that surface?" with the WCAG
 * relative-luminance formula rather than a hand-tuned lightness threshold, so the
 * answer is the one an accessibility check would give.
 */

/** The two inks anything drawn on a category colour may use. */
export const INK_LIGHT = "#ffffff";
/** Near-black rather than pure black — matches the app's ink, not a CRT. */
export const INK_DARK = "#0a0a0a";

/** `#rgb` or `#rrggbb`, the two forms the category colour column ever holds. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Is this a hex colour string this module can reason about? */
export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

/** `#abc` / `#aabbcc` → `[r, g, b]` in 0–255, or `null` if it is neither. */
function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim();
  if (!isHexColor(hex)) return null;
  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** One sRGB channel, linearised — WCAG 2.x §relative luminance. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * A colour's WCAG **relative luminance** (0 = black, 1 = white). `null` for a
 * string this module cannot parse, so callers decide what an unknown surface
 * means rather than silently treating it as black.
 */
function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (rgb === null) return null;
  const [r, g, b] = rgb.map(linearise) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The WCAG contrast ratio between two colours, 1 (identical) to 21
 * (black on white). Symmetric — the formula orders the pair by luminance itself.
 * An unparseable colour yields 1, the "no contrast at all" answer, so it can
 * never win a comparison against a colour that does parse.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return 1;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Which of {@link INK_LIGHT} / {@link INK_DARK} to draw on `background` — simply
 * whichever contrasts more. Ties and unparseable surfaces go to the dark ink,
 * which is the safe answer for the neutral light chip an unparseable colour
 * degrades to.
 */
export function readableInk(background: string): string {
  return contrastRatio(background, INK_LIGHT) > contrastRatio(background, INK_DARK)
    ? INK_LIGHT
    : INK_DARK;
}
