/**
 * GENERATED FILE — do not edit.
 *
 * Written by `bun run landing:screenshots` from the images the demo capture commits to
 * `docs/screenshots/` (issue #149), together with the copies of them under
 * `public/screenshots/` that the URLs below point at. Change the images, or
 * change the command; editing this file changes neither and fails
 * `src/screenshots/sync.test.ts`, which renders it again and compares.
 *
 * The digests are what make a stale copy visible: they are of the source
 * images, so a re-capture that was never synced does not typecheck its way
 * past review.
 */

/** One frame, at the URL the built site serves it from. */
export type ShippedImage = {
  readonly src: string;
  readonly bytes: number;
  readonly digest: string;
};

/** One surface, in both colour schemes, at one intrinsic size. */
export type ShippedScreenshot = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly light: ShippedImage;
  readonly dark: ShippedImage;
};

/** Every pair the page ships, by the capture's name for the surface. */
export const SHIPPED_SCREENSHOTS: readonly ShippedScreenshot[] = [
  {
    name: "recap",
    width: 2880,
    height: 1800,
    light: { src: "/screenshots/recap-light.webp", bytes: 108076, digest: "af95b0863125" },
    dark: { src: "/screenshots/recap-dark.webp", bytes: 107878, digest: "edbb2ec967bf" },
  },
  {
    name: "transactions",
    width: 2880,
    height: 1800,
    light: { src: "/screenshots/transactions-light.webp", bytes: 145764, digest: "4ee47b37055e" },
    dark: { src: "/screenshots/transactions-dark.webp", bytes: 138526, digest: "025c86c8e421" },
  },
];
