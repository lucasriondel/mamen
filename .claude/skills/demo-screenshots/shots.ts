/**
 * What the published screenshots are, as data (issue #144).
 *
 * The pipeline splits in two: this module says *what* is captured — the
 * surfaces, the viewport, the URL each frame is taken at, the state each page
 * has to reach before it is worth a shot — and `capture.ts` beside it drives a
 * browser to do it. The split is not tidiness: everything here is a pure value,
 * so `packages/web/src/test/demo-screenshots.test.ts` asserts the shot list and
 * the committed files without a browser or a running stack, which is the only
 * half of this that a CI run can hold.
 *
 * Two rules the constants below carry, both of which have quietly ruined a
 * capture before:
 *
 * - **the viewport is the thing that decides legibility**, not the output size.
 *   Shooting at the width the README displays (~900 px) gives a cramped app;
 *   shooting at 2560 lays the app out for a monitor and the downscaled result is
 *   illegible. So the app is laid out at {@link VIEWPORT} — a normal laptop
 *   window — and the pixels are bought with {@link DEVICE_SCALE_FACTOR}, which
 *   changes nothing about the layout.
 * - **every input a frame depends on is written down here.** The scheme comes
 *   from `?theme=` rather than from the machine's preference, and Recap's period
 *   is pinned rather than defaulted, because the default is the current month
 *   and the demo dataset's months are fixed ones in 2026.
 */

/** The two colour schemes, in the order a pair is captured and named. */
export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * The CSS-pixel window the app is laid out in — a laptop-sized browser, which is
 * how the app is used and therefore how it should photograph. Wider is not more
 * detail: it is a sparser layout, shrunk into the same README column.
 */
export const VIEWPORT = { width: 1440, height: 900 } as const;

/**
 * Pixels per CSS pixel. 2 is a retina capture: the file is 2560×1600 and stays
 * sharp on the displays people read a README on, while the app inside it is
 * still laid out for a 1280-wide window.
 */
export const DEVICE_SCALE_FACTOR = 2;

/** WebP, and the quality `Page.captureScreenshot` is asked for. */
export const IMAGE_QUALITY = 80;

/** Where the published files live, relative to the repo root. */
export const OUTPUT_DIR = "docs/screenshots";

/** The default the capture runs against: the demo stack's published port. */
export const DEMO_BASE_URL = "http://localhost:5400/app";

/** How long a surface gets to reach {@link Surface.ready} before we give up. */
export const READY_TIMEOUT_MS = 30_000;

export interface Surface {
  /** The half of a file name that is not the scheme. */
  name: string;
  /** The route, under the app's base path. */
  path: string;
  /** Search params pinned so the frame does not depend on the day it was taken. */
  search: Record<string, string>;
  /**
   * A JavaScript expression, evaluated in the page, that is true once the view
   * holds the data it is being photographed for.
   *
   * It is deliberately about *this* surface's content. The driver already waits
   * for the app-wide signals — `document.readyState`, fonts, images, and the
   * absence of any `[aria-busy]` region, which is what every skeleton screen in
   * the app sets (`components/ui/skeleton.tsx`). What that cannot tell you is
   * whether the table you came for has rows in it: a view that resolved to its
   * empty state is settled too, and a screenshot of it is the bug this catches.
   */
  ready: string;
}

/**
 * The surfaces the README names as the two worth showing: the curation table
 * everything passes through, and the read-back that is the point of curating.
 */
export const SURFACES: Surface[] = [
  {
    name: "transactions",
    path: "/transactions",
    // No filter: the demo's 175 rows are all dated in fixed months, and the
    // unfiltered table is the surface as it is first met.
    search: {},
    ready: "document.querySelectorAll('table tbody tr').length >= 10",
  },
  {
    name: "recap",
    path: "/recap",
    // Pinned to the demo's calendar year. The route's default period is the
    // *current* month (`features/recap/search.ts`), and the dataset's six months
    // are 2026-01 to 2026-06 — so the default is an empty recap on any machine
    // whose clock has passed them, which is every machine after mid-2026.
    search: { period: "year", year: "2026" },
    // Both breakdowns, and a figure in them: the shape of the page is there
    // before the numbers are, and an empty period renders the same headings.
    ready:
      "document.body.innerText.includes('Share by category') &&" +
      " document.body.innerText.includes('Share by issuer') &&" +
      " /\\d,\\d{2}\\s*€/.test(document.body.innerText)",
  },
];

export interface Shot {
  surface: Surface;
  theme: Theme;
  /** The committed file name, inside {@link OUTPUT_DIR}. */
  file: string;
}

/** Every frame the pipeline takes: each surface, in each scheme. */
export const SHOTS: Shot[] = SURFACES.flatMap((surface) =>
  THEMES.map((theme) => ({ surface, theme, file: `${surface.name}-${theme}.webp` })),
);

/**
 * The URL a frame is taken at. `theme` is appended last and is the app's own
 * capture switch (`packages/web/CONTEXT.md`, issue #143): it is written to the
 * key `next-themes` reads, so the scheme survives the reload the browser does
 * between frames rather than being re-forced by a param the router may drop.
 */
export function shotUrl(baseUrl: string, shot: Shot): string {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${shot.surface.path}`);

  for (const [key, value] of Object.entries(shot.surface.search)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("theme", shot.theme);

  return url.toString();
}

/**
 * What a frame is compared against its partner on — everything about the page
 * except its colours. Captured in the browser immediately before the shot, so
 * "the pair shows the same thing" is checked rather than assumed.
 */
export interface Signature {
  /** The laid-out page size, which a mis-pinned viewport changes. */
  width: number;
  height: number;
  /** Where the page is scrolled to. Two frames at different offsets do not swap. */
  scrollX: number;
  scrollY: number;
  /** The rendered text, whitespace-collapsed. Colours do not appear in it. */
  text: string;
}

/**
 * How the two frames of a pair differ, in a sentence, or `null` if they do not.
 * A difference here is fatal to the run: the pair is what the README swaps on
 * the reader's colour scheme, and a swap that moves the page reads as a glitch.
 */
export function signatureMismatch(light: Signature, dark: Signature): string | null {
  for (const key of ["width", "height", "scrollX", "scrollY"] as const) {
    if (light[key] !== dark[key]) return `${key}: light ${light[key]}, dark ${dark[key]}`;
  }
  if (light.text !== dark.text) {
    const at = [...light.text].findIndex((char, index) => char !== dark.text[index]);
    return `text diverges at character ${at}: light "${light.text.slice(at, at + 60)}", dark "${dark.text.slice(at, at + 60)}"`;
  }
  return null;
}
