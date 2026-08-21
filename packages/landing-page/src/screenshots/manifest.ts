import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Where the landing page's screenshots come from, what they weigh, and the
 * module the command writes about them (issue #149).
 *
 * The images are captured once, for the README
 * (`.claude/skills/demo-screenshots/SKILL.md`), and committed under
 * `docs/screenshots/`. The landing page cannot read them there: its image is
 * built from a context that excludes `docs/` (`.dockerignore`), and the
 * deployed page is not served from the repository host. So this package carries
 * **copies** under `public/`, and everything that keeps a copy honest lives
 * here — the pairing, the intrinsic size, the digest, the ceiling — as pure
 * functions over bytes, so `sync.ts` can write the copies and `sync.test.ts`
 * can regenerate them in memory and compare.
 *
 * Nothing in this module is read at render time. The page's only knowledge of
 * the images is the generated module (`src/content/screenshots.gen.ts`), which
 * imports nothing at all; that is what keeps `node:fs` out of the build-time
 * React tree.
 *
 * Paths are resolved from `import.meta.url` rather than from the working
 * directory, because the two readers stand in different places: vitest runs
 * from the package root, the command runs from the repo root.
 */

const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Where the capture writes, and the README points: the repo's own copy. */
export const SOURCE_DIR = from("../../../../docs/screenshots/");

/** Where the page serves them from — Vite copies `public/` into `dist` verbatim. */
export const SHIPPED_DIR = from("../../public/screenshots/");

/** The module the command writes, and the page reads. */
export const GENERATED_MODULE = from("../content/screenshots.gen.ts");

/** The URL prefix `SHIPPED_DIR` lands on once the build has copied it. */
export const SHIPPED_URL_PREFIX = "/screenshots";

/** The documented way to rewrite both of the above. */
export const SYNC_COMMAND = "bun run landing:screenshots";

/**
 * What every copy in `public/` may weigh together — the image's own payload,
 * and what the container serves.
 *
 * Today's four frames are ~498 kB, so this is about a fifth of headroom: enough
 * for a re-capture of the same surfaces, and not enough for a third pair. That
 * is deliberate. A screenshot that shows more, or shows it more legibly, is a
 * *larger* file, so growth here is a trade between page weight and what the
 * page can show — a decision to take in the open, by raising this number in a
 * commit that says why, rather than one that arrives inside an image diff.
 */
export const TOTAL_BYTE_CEILING = 600_000;

/**
 * What one reader downloads: `<picture>` fetches the frame their colour scheme
 * matches and never the other, so the figure that decides how the page *feels*
 * is half the total, not all of it.
 */
export const PER_SCHEME_BYTE_CEILING = 300_000;

/** The two colour schemes a pair is captured in, and the page swaps between. */
export const SCHEMES = ["light", "dark"] as const;

export type Scheme = (typeof SCHEMES)[number];

/** One frame, as the generated module records it. */
export type ShippedImage = {
  /** The URL the page loads it from. */
  readonly src: string;
  /** Its size on disk, which is what the ceiling is spent on. */
  readonly bytes: number;
  /** A short SHA-256 of the file: what makes a stale copy a failing test. */
  readonly digest: string;
};

/** A pair of frames — one surface, both schemes — and the size they share. */
export type ShippedScreenshot = {
  /** The capture's name for the surface, e.g. `transactions`. */
  readonly name: string;
  /** Intrinsic pixels, so an `<img>` can reserve the space before it loads. */
  readonly width: number;
  readonly height: number;
  readonly light: ShippedImage;
  readonly dark: ShippedImage;
};

/**
 * The pixel size of a WebP file, read out of its header rather than decoded.
 *
 * Restated from `packages/web/src/test/demo-screenshots.test.ts`, which reads
 * the same four files for the README's half of this: importing across packages
 * is the dependency this one is built without (`src/packaging.test.ts`), and
 * twenty lines of header parsing is a cheaper copy than a shared package. Both
 * copies read the same bytes, so a divergence is a failing test on one side.
 *
 * A RIFF container whose fourth word is `WEBP`, then one of three bitstream
 * chunks: `VP8 ` (lossy) is what a Chrome screenshot emits, and the other two
 * are handled so a re-encoded file does not read as a corrupt one.
 */
export function webpSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a WebP file");
  }

  const chunk = bytes.toString("ascii", 12, 16);

  if (chunk === "VP8 ") {
    // Lossy: a 10-byte frame header, then 14 bits of width and 14 of height.
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: 14 bits each, packed across the four bytes after the signature.
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    // Extended: canvas size as two 24-bit values, each stored minus one.
    return {
      width: (bytes.readUIntLE(24, 3) & 0xffffff) + 1,
      height: (bytes.readUIntLE(27, 3) & 0xffffff) + 1,
    };
  }
  throw new Error(`unknown WebP chunk: ${chunk}`);
}

/**
 * A file's identity in twelve hex digits. Short because it is read in a diff
 * rather than verified against anything: what it has to do is change whenever
 * the bytes do, which any prefix of a SHA-256 does.
 */
export const digestOf = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex").slice(0, 12);

/** The file a surface's frame is captured to, in either directory. */
export const frameFile = (name: string, scheme: Scheme): string => `${name}-${scheme}.webp`;

/**
 * Every pair the capture has committed, read from `SOURCE_DIR` and sorted by
 * name.
 *
 * The directory is the list. A surface added to `shots.ts` and captured shows
 * up here on the next sync without an edit — and a half-captured surface, or a
 * pair whose two frames were laid out at different sizes, throws rather than
 * shipping a `<picture>` that jumps when the reader's scheme changes.
 */
export function readSourceScreenshots(): ShippedScreenshot[] {
  const names = [
    ...new Set(
      readdirSync(SOURCE_DIR)
        .filter((file) => file.endsWith(".webp"))
        .map((file) => file.replace(/-(?:light|dark)\.webp$/, "")),
    ),
  ].sort();

  return names.map((name) => {
    const frames = SCHEMES.map((scheme) => {
      const file = frameFile(name, scheme);
      const bytes = readFileSync(`${SOURCE_DIR}${file}`);
      return {
        scheme,
        size: webpSize(bytes),
        image: {
          src: `${SHIPPED_URL_PREFIX}/${file}`,
          bytes: bytes.byteLength,
          digest: digestOf(bytes),
        },
      };
    });

    const [light, dark] = frames as [(typeof frames)[number], (typeof frames)[number]];
    if (light.size.width !== dark.size.width || light.size.height !== dark.size.height) {
      throw new Error(
        `${name}: the two frames disagree about their size — ` +
          `light ${light.size.width}×${light.size.height}, dark ${dark.size.width}×${dark.size.height}`,
      );
    }

    return { name, ...light.size, light: light.image, dark: dark.image };
  });
}

/** What every frame weighs together: the payload the container carries. */
export const totalBytes = (shots: readonly ShippedScreenshot[]): number =>
  SCHEMES.reduce((total, scheme) => total + schemeBytes(shots, scheme), 0);

/** What a reader on one colour scheme downloads. */
export const schemeBytes = (shots: readonly ShippedScreenshot[], scheme: Scheme): number =>
  shots.reduce((total, shot) => total + shot[scheme].bytes, 0);

/**
 * Why these images may not ship, in a sentence a reader can act on, or `null`.
 *
 * The sentence is the point: a ceiling that reports "too big" leaves the next
 * person to guess between dropping quality, dropping a surface and raising the
 * number, and quality is the one that gets dropped silently.
 */
export function overCeiling(shots: readonly ShippedScreenshot[]): string | null {
  const total = totalBytes(shots);
  if (total > TOTAL_BYTE_CEILING) {
    return (
      `The screenshots weigh ${total} bytes, over the ${TOTAL_BYTE_CEILING}-byte ceiling. ` +
      `Ship fewer surfaces, or raise TOTAL_BYTE_CEILING deliberately — a smaller file is a ` +
      `less legible screenshot, so this is a trade rather than a fix.`
    );
  }

  for (const scheme of SCHEMES) {
    const bytes = schemeBytes(shots, scheme);
    if (bytes > PER_SCHEME_BYTE_CEILING) {
      return (
        `A reader on ${scheme} would download ${bytes} bytes of screenshot, over the ` +
        `${PER_SCHEME_BYTE_CEILING}-byte ceiling. Ship fewer surfaces, or raise ` +
        `PER_SCHEME_BYTE_CEILING deliberately.`
      );
    }
  }

  return null;
}

/** One `ShippedImage`, as a line of the module. */
const imageLiteral = (image: ShippedImage): string =>
  `{ src: ${JSON.stringify(image.src)}, bytes: ${image.bytes}, digest: ${JSON.stringify(image.digest)} }`;

/**
 * The text of `src/content/screenshots.gen.ts`.
 *
 * Rendered rather than written, and compared rather than trusted: `sync.ts`
 * writes what this returns and `sync.test.ts` asserts the file on disk *is*
 * what it returns, so the copies cannot go stale without a red run. Everything
 * about the output is therefore deterministic — the pairs come back sorted, and
 * the file is `.gen.ts`, which is the repo's name for a file no formatter and
 * no linter touches (`.oxlintrc.json`, `.oxfmtrc.json`).
 *
 * It declares its own types and imports nothing. The page reaches the images
 * through this module alone, so a module that imported `node:fs` — as this one
 * does — would put the filesystem inside the build-time React tree.
 */
export function renderGeneratedModule(shots: readonly ShippedScreenshot[]): string {
  const entries = shots
    .map((shot) =>
      [
        "  {",
        `    name: ${JSON.stringify(shot.name)},`,
        `    width: ${shot.width},`,
        `    height: ${shot.height},`,
        `    light: ${imageLiteral(shot.light)},`,
        `    dark: ${imageLiteral(shot.dark)},`,
        "  },",
      ].join("\n"),
    )
    .join("\n");

  return `/**
 * GENERATED FILE — do not edit.
 *
 * Written by \`${SYNC_COMMAND}\` from the images the demo capture commits to
 * \`docs/screenshots/\` (issue #149), together with the copies of them under
 * \`public/screenshots/\` that the URLs below point at. Change the images, or
 * change the command; editing this file changes neither and fails
 * \`src/screenshots/sync.test.ts\`, which renders it again and compares.
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
${entries}
];
`;
}
