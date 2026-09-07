import { type ShippedScreenshot, SHIPPED_SCREENSHOTS } from "./screenshots.gen";

/**
 * What the page says about the screenshots it shows (issue #149).
 *
 * The images themselves are not written here: they are captured for the README
 * and copied into this package by `bun run landing:screenshots`, which writes
 * `screenshots.gen.ts` beside this file — the URLs, the intrinsic sizes, the
 * weights. What is written here is the half a generator cannot produce: the
 * description of each surface for a reader who is not seeing it.
 *
 * The **alt text is the README's, word for word**, and `src/screenshots/sync.
 * test.ts` holds the two equal. Neither document generates the other — the
 * repo's rule for the install guide too (**README sync**, `CONTEXT.md`) — so
 * the only thing that keeps one description of an image from becoming two is a
 * test that reads both.
 *
 * The order here is the order the hero cycles them: the curation table first,
 * because it is what every row passes through, then the read-back that is the
 * point of curating. `screenshots.gen.ts` is sorted by name and says nothing
 * about sequence.
 *
 * There is one place these render, and it is the hero — every surface, stacked
 * in the frame the page opens with and cross-faded there
 * (`src/components/HeroScreenshotCycle.tsx`). The page had a section below
 * repeating the ones the hero did not lead with; showing the same two frames
 * twice was the only thing it did.
 */

/** One surface, as the page introduces it. */
export type ScreenshotCopy = {
  /** The capture's name for the surface — the key into the generated module. */
  readonly name: string;
  /**
   * What the image shows, for a reader who is not seeing it. Long, specific,
   * and identical to the README's `alt` for the same file.
   */
  readonly alt: string;
};

/** Every surface the page shows, in the order the hero cycles them. */
export type ScreenshotSection = {
  readonly shots: readonly ScreenshotCopy[];
};

export const SCREENSHOTS: ScreenshotSection = {
  shots: [
    {
      name: "transactions",
      alt:
        "The Transactions table: filters across the top, then rows showing date, " +
        "account, issuer, the raw bank label, category and amount.",
    },
    {
      name: "recap",
      alt:
        "The Recap screen for a calendar year: internal transfers and excluded rows " +
        "reported above two donut breakdowns, share by category and share by issuer, " +
        "over a month-by-month earnings and spending chart.",
    },
  ],
};

/** A surface's words and its two frames, which is what a `<figure>` needs. */
export type ScreenshotFigure = ScreenshotCopy & ShippedScreenshot;

/**
 * The figures the hero cycles, in the order this module lists them.
 *
 * It throws on a surface the capture never produced rather than rendering an
 * empty frame into the cycle. The pairing is asserted both ways in
 * `src/screenshots/sync.test.ts`; this is the same fact at the point where a
 * mismatch would otherwise reach a reader — a build that fails is the right
 * outcome for a page whose whole job here is showing the app.
 */
export function screenshotFigures(): readonly ScreenshotFigure[] {
  return SCREENSHOTS.shots.map((copy) => {
    const shipped = SHIPPED_SCREENSHOTS.find((shot) => shot.name === copy.name);
    if (shipped === undefined) {
      throw new Error(`no screenshots for "${copy.name}" — run \`bun run landing:screenshots\``);
    }
    return { ...copy, ...shipped };
  });
}
