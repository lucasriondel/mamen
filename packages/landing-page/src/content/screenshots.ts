import { type ShippedScreenshot, SHIPPED_SCREENSHOTS } from "./screenshots.gen";

/**
 * What the page says about the screenshots it shows (issue #149).
 *
 * The images themselves are not written here: they are captured for the README
 * and copied into this package by `bun run landing:screenshots`, which writes
 * `screenshots.gen.ts` beside this file — the URLs, the intrinsic sizes, the
 * weights. What is written here is the half a generator cannot produce: the
 * heading, and one sentence per surface for a reader who is deciding whether
 * this is a thing they want to run.
 *
 * The **alt text is the README's, word for word**, and `src/screenshots/sync.
 * test.ts` holds the two equal. Neither document generates the other — the
 * repo's rule for the install guide too (**README sync**, `CONTEXT.md`) — so
 * the only thing that keeps one description of an image from becoming two is a
 * test that reads both.
 *
 * The order here is the order the page renders: the curation table first,
 * because it is what every row passes through, then the read-back that is the
 * point of curating. `screenshots.gen.ts` is sorted by name and says nothing
 * about sequence.
 */

/** One surface, as the page introduces it. */
export type ScreenshotCopy = {
  /** The capture's name for the surface — the key into the generated module. */
  readonly name: string;
  /** The screen's name in the app, e.g. `Transactions`. */
  readonly title: string;
  /** What the screen is for, in a clause that follows the title. */
  readonly caption: string;
  /**
   * What the image shows, for a reader who is not seeing it. Long, specific,
   * and identical to the README's `alt` for the same file.
   */
  readonly alt: string;
};

/** The section, and the surfaces it shows in order. */
export type ScreenshotSection = {
  readonly heading: string;
  readonly lead: string;
  readonly shots: readonly ScreenshotCopy[];
};

export const SCREENSHOTS: ScreenshotSection = {
  heading: "What it looks like",
  lead:
    "Two screens from the app, over an invented household's accounts, in whichever " +
    "colour scheme you read this page in.",
  shots: [
    {
      name: "transactions",
      title: "Transactions",
      caption: "every imported row, curated in place.",
      alt:
        "The Transactions table: filters across the top, then rows showing date, " +
        "account, issuer, the raw bank label, category and amount.",
    },
    {
      name: "recap",
      title: "Recap",
      caption: "where the money went, by category and by issuer.",
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
 * The figures the page renders, in the order this module lists them.
 *
 * It throws on a surface with no images rather than rendering a caption with
 * nothing under it. The pairing is asserted both ways in
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
