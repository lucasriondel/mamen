import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHIPPED_SCREENSHOTS } from "./content/screenshots.gen";
import { renderPage } from "./page";

/**
 * The landing page's colours, held to the app's (issue #146).
 *
 * A visitor who follows the link into the app should not feel they changed
 * product. The page therefore paints from the app's ramp — the warm-tinted
 * neutrals of `--gousse-*`, and mamen's blue accent on top of them — rather
 * than from a palette of its own.
 *
 * It does so by **duplication, not by dependency**. This package takes none of
 * the app's Tailwind, theme layer or component library (issue #113), so the
 * values are written out again in `src/styles.css`. What stops two hand-kept
 * copies from drifting is this file: the app's sheets are *read* here, at test
 * time, and the landing page's are held against them. Reading a sibling
 * package's file is what `packaging.test.ts` already does to keep the two
 * images apart; it puts nothing in the built page, which is the property that
 * matters.
 *
 * The one value that is deliberately not a copy is the light scheme's `--muted`
 * — the app's own is 4.1:1 on its own background, and this page sets whole
 * paragraphs in it. It is stepped down the same warm ramp until it clears
 * 4.5:1, which is the assertion below rather than a comment.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const css = read("src/styles.css");
const appTokens = read("../web/src/styles/gousse/tokens.css");
const appTint = read("../web/src/index.css");

/** Where the block opened at `at` ends: the index just past its `}`, braces
 *  matched, so a nested rule — a media query's contents — is stepped over. */
function endOfBlock(source: string, at: number): number {
  let depth = 0;
  for (let i = source.indexOf("{", at); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return i + 1;
  }
  throw new Error(`unterminated block at ${at}`);
}

/** The body of the first block opened by `selector`, braces matched. The
 *  selector is matched at the start of a line, so `a` finds the bare anchor
 *  rule rather than the `a {` inside `.cta {`. */
function block(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = source.search(new RegExp(`^\\s*${escaped}\\s*\\{`, "m"));
  if (at < 0) throw new Error(`no \`${selector}\` block`);
  return source.slice(source.indexOf("{", at) + 1, endOfBlock(source, at) - 1);
}

/**
 * The sheet as a narrow viewport reads it: every `min-width` media block cut
 * out, the rest left where it is.
 *
 * A phone applies the base rules and none of the widening ones, so this is the
 * stylesheet whose every declaration has to survive 320 px of screen.
 */
const narrow = (() => {
  let source = css;
  for (;;) {
    const at = source.search(/@media\s*\(min-width:/);
    if (at < 0) return source;
    source = source.slice(0, at) + source.slice(endOfBlock(source, at));
  }
})();

/** Every custom property a block declares, `--name` → its value. */
const vars = (body: string): Record<string, string> =>
  Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [
      `--${m[1] as string}`,
      (m[2] as string).trim(),
    ]),
  );

/** `249 247 244` — gousse's channel triples — as `#f9f7f4`. */
const hex = (triple: string) =>
  `#${triple
    .split(/\s+/)
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`;

/** `#rrggbb` → `[r, g, b]` in 0–255. */
const channels = (color: string): [number, number, number] => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!match) throw new Error(`not a six-digit hex colour: ${color}`);
  return [1, 2, 3].map((i) => Number.parseInt(match[i] as string, 16)) as [number, number, number];
};

/** WCAG relative luminance — the same formula `packages/web/src/lib/color.ts`
 *  uses, restated here because importing the app's source is the dependency
 *  this whole package is built to avoid. */
function luminance(color: string): number {
  const [r, g, b] = channels(color).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colours, 1–21. */
function contrast(a: string, b: string): number {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Is this neutral warm-tinted — red down to blue — rather than a pure grey? */
const warm = ([r, g, b]: [number, number, number]) => r >= g && g >= b && r > b;

/** The app's ramp per scheme: gousse's tokens, with mamen's accent tint over
 *  the top (`packages/web/src/index.css` overrides `--gousse-accent`). */
const app = {
  light: { ...vars(block(appTokens, ":root")), ...vars(block(appTint, ":root")) },
  dark: { ...vars(block(appTokens, ".dark")), ...vars(block(appTint, ".dark")) },
} as const;

/** The landing page's ramp per scheme. Dark is a media override, not a class:
 *  the page ships no JavaScript, so there is nothing to toggle one with. */
const landing = {
  light: vars(block(css, ":root")),
  dark: vars(block(block(css, "@media (prefers-color-scheme: dark)"), ":root")),
} as const;

const SCHEMES = ["light", "dark"] as const;

/** The neutrals the page paints with, and the app token each one restates. */
const NEUTRALS = [
  ["--bg", "--gousse-bg"],
  ["--ink", "--gousse-ink"],
  ["--line", "--gousse-line"],
] as const;

describe("the landing page's palette", () => {
  it("restates the app's neutral ramp rather than inventing one", () => {
    for (const scheme of SCHEMES) {
      for (const [ours, theirs] of NEUTRALS) {
        expect(landing[scheme][ours]).toBe(hex(app[scheme][theirs] as string));
      }
    }
  });

  it("is warm-tinted throughout, as the app's neutrals are", () => {
    // The failure this guards is a lazy translation: `#0a0a0a` and `#ededed`
    // are the greys the page used to be built from, and they read as a
    // different product beside a ramp that leans red.
    for (const scheme of SCHEMES) {
      for (const name of ["--bg", "--ink", "--muted", "--line"]) {
        expect({
          scheme,
          name,
          warm: warm(channels(landing[scheme][name] as string)),
        }).toStrictEqual({ scheme, name, warm: true });
      }
    }
  });

  it("takes the app's accent, in both schemes", () => {
    // mamen tracks miel's blue so the two read as one design language; a third
    // accent on the page that advertises mamen makes it a third product.
    for (const scheme of SCHEMES) {
      expect(landing[scheme]["--accent"]).toBe(hex(app[scheme]["--gousse-accent"] as string));
    }
  });

  it("steps the light muted down the app's own ramp until it is readable", () => {
    // The app's `--gousse-muted` is 4.1:1 on `--gousse-bg`, which is fine for
    // the table captions it labels and not fine for the paragraphs this page
    // sets in it. Darker, on the same tint — not a different colour.
    const ours = channels(landing.light["--muted"] as string);
    const theirs = channels(hex(app.light["--gousse-muted"] as string));

    expect(ours[0]).toBe(ours[1]);
    expect(ours[0] - ours[2]).toBe(theirs[0] - theirs[2]);
    expect(luminance(landing.light["--muted"] as string)).toBeLessThanOrEqual(
      luminance(hex(app.light["--gousse-muted"] as string)),
    );

    // Dark needs no such step — the app's value already clears it there, so
    // taking anything else would be drift for its own sake.
    expect(landing.dark["--muted"]).toBe(hex(app.dark["--gousse-muted"] as string));
  });
});

describe("the landing page's text", () => {
  it("clears 4.5:1 against its background, in both schemes", () => {
    for (const scheme of SCHEMES) {
      const bg = landing[scheme]["--bg"] as string;
      for (const name of ["--ink", "--muted", "--accent"]) {
        const ratio = contrast(landing[scheme][name] as string, bg);
        expect({ scheme, name, readable: ratio >= 4.5 }).toStrictEqual({
          scheme,
          name,
          readable: true,
        });
      }
    }
  });

  it("clears it inside the primary action too", () => {
    // The call to action inverts the ramp — ink fill, background-coloured
    // label — so its contrast is the ramp's own, and the assertion says so
    // rather than assuming it.
    for (const scheme of SCHEMES) {
      const ratio = contrast(landing[scheme]["--bg"] as string, landing[scheme]["--ink"] as string);
      expect({ scheme, readable: ratio >= 4.5 }).toStrictEqual({ scheme, readable: true });
    }
  });
});

describe("the landing page's accent", () => {
  it("highlights rather than fills", () => {
    // The app's primary button is filled with **ink**; blue is a focus ring,
    // an active state, a tint. A page drenched in it would misrepresent what
    // the reader is about to open.
    expect(css).not.toMatch(/background(-color)?:\s*var\(--accent\)/);
    expect(block(css, ".cta")).toMatch(/background:\s*var\(--ink\)/);
    expect(block(css, ".cta")).toMatch(/color:\s*var\(--bg\)/);
  });

  it("is where the app puts it: links, and the keyboard focus ring", () => {
    expect(block(css, "a")).toMatch(/color:\s*var\(--accent\)/);
    expect(block(css, "a:focus-visible")).toMatch(/var\(--accent\)/);
  });
});

describe("the landing page's colour scheme", () => {
  it("follows the reader's preference rather than forcing dark", () => {
    // `color-scheme: dark` was a decision made for every visitor. There is no
    // stored choice to honour here and no script to read one with, so the
    // preference is the whole input.
    expect(block(css, ":root")).toMatch(/color-scheme:\s*light dark;/);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
  });

  it("tints the browser chrome per scheme, as the app's shell does", async () => {
    // One `theme-color` cannot say two things, so it is two tags keyed off the
    // OS — exactly the pair in `packages/web/index.html`.
    const html = await renderPage();

    for (const scheme of SCHEMES) {
      const pattern = new RegExp(
        `<meta name="theme-color" media="\\(prefers-color-scheme: ${scheme}\\)" content="([^"]+)"`,
      );
      expect(html.match(pattern)?.[1]).toBe(landing[scheme]["--bg"]);
    }
    expect(html).toMatch(/<meta name="color-scheme" content="light dark"/);
  });
});

describe("the landing page's stylesheet", () => {
  it("still reaches for none of the app's styling", () => {
    // The duplication above is the point: this sheet is hand-written, and the
    // moment it pulls gousse or Tailwind in the package has taken the
    // dependency issue #113 exists to keep out of the image. Naming them in a
    // comment is the opposite — it is what makes the copy traceable.
    expect(css).not.toMatch(/@import|@tailwind|@apply|@plugin|@theme/);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/gousse|tailwind|@mamen/i);
  });
});

describe("the screenshots the page shows", () => {
  it("scales every frame down into the column it is read in", () => {
    // The frames are 2880 px wide — four times the reading column and wider
    // than any phone. At their intrinsic size they would decide the page's
    // width, and every line of prose on it would scroll sideways. The
    // `width`/`height` attributes stay on the tag (`page.test.ts`), so the
    // height has to be released here or a scaled frame is squashed.
    const rule = block(css, ".screenshots img");

    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/height:\s*auto/);
  });

  it("has pixels to spare at the widest size it shows them", () => {
    // Sharpness is a ratio, not a file size: the frames are captured at a
    // device scale factor of 2 so that a retina screen has two image pixels
    // for every CSS pixel it paints. Widening the figures spends that ratio —
    // this is the assertion that ties the two numbers together, so a section
    // widened past what the capture can cover fails here rather than shipping
    // a soft screenshot nobody notices in review.
    const widest = Number(block(css, ".screenshots").match(/width:\s*([\d.]+)rem/)?.[1]) * 16;
    expect(widest).toBeGreaterThan(0);

    for (const shot of SHIPPED_SCREENSHOTS) {
      expect(shot.width / widest, shot.name).toBeGreaterThanOrEqual(2);
    }
  });

  it("steps outside that column only where there is room to", () => {
    // A screenshot of a 1440-px app is legible in a 42rem column and better
    // in a wider one, so the figures widen past the prose on a screen that
    // can hold it. What makes that safe is where the rule lives: a negative
    // margin outside a `min-width` query pulls the image under the body's
    // padding — off the side of a phone — and takes the horizontal scrollbar
    // with it. So the assertion is on the sheet a narrow viewport sees.
    expect(css).toMatch(/@media\s*\(min-width:/);
    expect(narrow).not.toMatch(/margin[\w-]*:\s*-/);

    // Nothing in the narrow sheet may be given a width the viewport might not
    // have. `100%`, `auto` and the `max-width`s above are the whole vocabulary.
    const widths = [...narrow.matchAll(/^\s*width:\s*([^;]+);/gm)].map((m) => m[1] as string);
    for (const width of widths) expect(width.trim()).toMatch(/^(?:100%|auto)$/);
  });
});
