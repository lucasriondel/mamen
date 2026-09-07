import { describe, expect, it } from "vitest";
import { ABOUT } from "./about";
import { ICONS, LUCIDE_LICENSE } from "./icons";
import { renderPage } from "../page";

/**
 * The inlined Lucide glyphs, and the notice their licence asks to travel with
 * them.
 *
 * The shapes are transcribed rather than imported (`icons.ts`), which is what
 * keeps this page's zero runtime dependencies intact — and what makes the ISC
 * attribution this package's own obligation rather than a bundler's. The last
 * assertion is the one that matters legally: the notice has to be *in the
 * rendered page*, not merely exported from a module nothing renders.
 */

const html = await renderPage();

describe("the inlined Lucide glyphs", () => {
  it("gives every feature a glyph that exists", () => {
    for (const feature of ABOUT.features) {
      expect(ICONS[feature.icon], feature.name).toBeDefined();
      expect(ICONS[feature.icon].length, feature.name).toBeGreaterThan(0);
    }
  });

  it("repeats none of them, which would make two rows read as one", () => {
    const used = ABOUT.features.map((feature) => feature.icon);
    expect(new Set(used).size).toBe(used.length);
  });

  it("carries no glyph nothing renders", () => {
    const used = new Set<string>(ABOUT.features.map((feature) => feature.icon));
    expect(Object.keys(ICONS).filter((name) => !used.has(name))).toStrictEqual([]);
  });

  it("draws every shape on Lucide's 24x24 grid", () => {
    // The component hardcodes that viewBox, so a shape transcribed from a
    // different grid renders off-centre or clipped.
    //
    // Only the **absolute** commands are checked. SVG's lowercase commands
    // take deltas, and a delta is legitimately negative and unbounded by the
    // box — `m6-6` inside `table-2` is a move six units up and left, not a
    // coordinate at -6. Reading those as coordinates is how this assertion
    // fails a glyph that is perfectly fine, so the path is split on its
    // commands and the relative ones are skipped.
    //
    // The leading `\.?` in the number pattern is load-bearing: SVG path data
    // omits the separator between a decimal and the next number, so
    // `1.414.586` is two coordinates, and a pattern demanding a digit before
    // the point reads the second as `586`.
    for (const [name, shapes] of Object.entries(ICONS)) {
      for (const shape of shapes) {
        for (const [, command, args] of shape.d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
          if ((command as string) !== (command as string).toUpperCase()) continue;

          const numbers = [...(args as string).matchAll(/-?(?:\d+\.?\d*|\.\d+)/g)].map((m) =>
            Number(m[0]),
          );
          for (const value of numbers) {
            expect(value, `${name} (${command}): ${shape.d}`).toBeGreaterThanOrEqual(-2);
            expect(value, `${name} (${command}): ${shape.d}`).toBeLessThanOrEqual(26);
          }
        }
      }
    }
  });

  it("renders one inline svg per feature, and fetches nothing to do it", () => {
    const glyphs = [...html.matchAll(/<svg class="feature-icon"/g)];
    expect(glyphs).toHaveLength(ABOUT.features.length);
  });
});

describe("Lucide's licence", () => {
  it("names the ISC terms and both copyright holders", () => {
    // The ISC licence permits the copy provided the notice accompanies it, so
    // the wording is the obligation rather than a nicety.
    expect(LUCIDE_LICENSE).toMatch(/ISC License/);
    expect(LUCIDE_LICENSE).toMatch(/Cole Bemis/);
    expect(LUCIDE_LICENSE).toMatch(/Lucide Contributors/);
  });

  it("reaches the rendered page, which is where it has to be", () => {
    // Exported but unrendered would satisfy every other test here and none of
    // the licence.
    expect(html).toContain("ISC License");
  });
});
