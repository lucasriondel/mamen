import { describe, expect, it } from "vitest";
import { CATEGORICAL_SLOTS, seriesTextColorFor } from "./chart-palette";

/**
 * The literal hex values behind the text-weight custom properties, mirrored
 * from `chart-palette.css` so the contrast floor is checked in CI rather than
 * trusted. jsdom resolves no stylesheet here, so the pairing is asserted by
 * hand: if a hue moves in the CSS, this table has to move with it.
 */
const LIGHT_TEXT: readonly string[] = [
  "#2875d1",
  "#cd4914",
  "#15855d",
  "#9e6b00",
  "#da2c6d",
  "#008300",
  "#4a3aa7",
  "#df2d2c",
];

const DARK_TEXT: readonly string[] = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55382",
  "#009700",
  "#9085e9",
  "#e66767",
];

const LIGHT_PANEL = "#ffffff";
const DARK_PANEL = "#171716";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = channel(Number.parseInt(hex.slice(1, 3), 16));
  const g = channel(Number.parseInt(hex.slice(3, 5), 16));
  const b = channel(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("chart palette text variants", () => {
  it("clears the 4.5:1 small-text floor on the light panel", () => {
    for (const [index, hex] of LIGHT_TEXT.entries()) {
      expect(contrast(hex, LIGHT_PANEL), `light series-${index + 1}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears the 4.5:1 small-text floor on the dark panel", () => {
    for (const [index, hex] of DARK_TEXT.entries()) {
      expect(contrast(hex, DARK_PANEL), `dark series-${index + 1}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("covers every categorical slot in both themes", () => {
    expect(LIGHT_TEXT).toHaveLength(CATEGORICAL_SLOTS);
    expect(DARK_TEXT).toHaveLength(CATEGORICAL_SLOTS);
  });

  it("resolves each slot to its own text variable, and the tail to the neutral", () => {
    for (let slot = 0; slot < CATEGORICAL_SLOTS; slot += 1) {
      expect(seriesTextColorFor(slot)).toBe(`var(--chart-series-${slot + 1}-text)`);
    }
    expect(seriesTextColorFor(null)).toBe("var(--chart-other-text)");
    expect(seriesTextColorFor(CATEGORICAL_SLOTS)).toBe("var(--chart-other-text)");
  });
});
