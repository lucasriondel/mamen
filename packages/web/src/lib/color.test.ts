import { describe, expect, it } from "vitest";
import { contrastRatio, INK_DARK, INK_LIGHT, isHexColor, readableInk } from "./color";

/**
 * The six seeded **Category folder** colours, copied from the API's
 * `0010_seed_categories` migration. Copied rather than imported: the web package
 * does not depend on the API, and these are the *shipped* values the avatar has
 * to stay legible against — if the seed ever moves, this list failing to match is
 * the signal, not a silent regression.
 */
const SEEDED_FOLDER_COLORS = [
  "#ef4444", // Food & Drink
  "#f97316", // Housing
  "#eab308", // Transport
  "#22c55e", // Health
  "#3b82f6", // Leisure
  "#8b5cf6", // Income & Other
];

describe("contrastRatio", () => {
  it("spans the full 1:1 – 21:1 range at the extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric — order of the pair cannot change the ratio", () => {
    expect(contrastRatio("#ef4444", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#ef4444"),
      10,
    );
  });

  it("reads three-digit shorthand as the six-digit colour it abbreviates", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(contrastRatio("#ffffff", "#000000"), 10);
  });
});

describe("readableInk", () => {
  it("picks the darker ink on a light surface and the lighter ink on a dark one", () => {
    expect(readableInk("#fefce8")).toBe(INK_DARK);
    expect(readableInk("#1e1b4b")).toBe(INK_LIGHT);
  });

  it("always returns whichever ink actually contrasts more", () => {
    for (const color of [...SEEDED_FOLDER_COLORS, "#94a3b8", "#000", "#fff"]) {
      const chosen = readableInk(color);
      const other = chosen === INK_LIGHT ? INK_DARK : INK_LIGHT;
      expect(contrastRatio(color, chosen)).toBeGreaterThanOrEqual(contrastRatio(color, other));
    }
  });

  /**
   * The contrast acceptance criterion, pinned as a number. WCAG 1.4.11 asks 3:1
   * for a non-text graphic, which is what the avatar's glyph is.
   *
   * This holds in *both* themes for free, and that is the reason the chip is
   * filled with the category colour rather than the glyph being stroked in it:
   * the pair being measured is glyph-on-category-colour, and neither side moves
   * with the theme. A glyph stroked in `#eab308` over the light `bg` token would
   * have to be re-checked per theme — and would fail one of them.
   */
  it("clears 3:1 against every seeded folder colour", () => {
    for (const color of SEEDED_FOLDER_COLORS) {
      expect(contrastRatio(color, readableInk(color))).toBeGreaterThanOrEqual(3);
    }
  });

  it("falls back to the dark ink for a colour it cannot parse", () => {
    expect(readableInk("rebeccapurple")).toBe(INK_DARK);
    expect(readableInk("")).toBe(INK_DARK);
  });
});

describe("isHexColor", () => {
  it("accepts the two hex forms and rejects everything else", () => {
    expect(isHexColor("#ef4444")).toBe(true);
    expect(isHexColor("#EF4444")).toBe(true);
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("ef4444")).toBe(false);
    expect(isHexColor("rgb(1,2,3)")).toBe(false);
    expect(isHexColor("")).toBe(false);
  });
});
