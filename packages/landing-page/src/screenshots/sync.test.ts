import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCREENSHOTS } from "../content/screenshots";
import { SHIPPED_SCREENSHOTS } from "../content/screenshots.gen";
import {
  GENERATED_MODULE,
  overCeiling,
  PER_SCHEME_BYTE_CEILING,
  readSourceScreenshots,
  renderGeneratedModule,
  SCHEMES,
  schemeBytes,
  SHIPPED_DIR,
  SOURCE_DIR,
  SYNC_COMMAND,
  totalBytes,
  TOTAL_BYTE_CEILING,
} from "./manifest";

/**
 * The screenshots the landing page ships, and the command that puts them there
 * (issue #149).
 *
 * The README points a `<picture>` straight at `docs/screenshots/` — a reader of
 * the repository already has those bytes. The deployed landing page cannot: it
 * is built from its own image, whose context excludes `docs/` entirely
 * (`.dockerignore`), and it is a different origin from the repository host. So
 * the page carries **copies**, and the whole risk of a copy is that it stops
 * being one. Nothing here is hand-placed:
 *
 * - `bun run landing:screenshots` copies the four files into `public/` and
 *   writes `src/content/screenshots.gen.ts`, which is the page's only knowledge
 *   of them — the URLs, the intrinsic size each `<img>` reserves, the bytes;
 * - this suite regenerates that module in memory from the source images and
 *   fails on any difference, so a re-capture that was not synced, a copy edited
 *   in place, and a hand-edit of the generated module are all one failing test;
 * - and the weight is capped rather than watched. Screenshots are the heaviest
 *   thing on the page by an order of magnitude, and a denser screenshot is a
 *   *larger* file — so a third surface, or a re-capture at higher quality, has
 *   to be a decision about page weight rather than a diff nobody weighed.
 *
 * Paths come from `manifest.ts` and are resolved from `import.meta.url`, not
 * from the working directory: the same functions run from the package root
 * (vitest) and from the repo root (the command).
 */

const sources = readSourceScreenshots();

const sourceBytes = (file: string) => readFileSync(`${SOURCE_DIR}${file}`);
const shippedBytes = (file: string) => readFileSync(`${SHIPPED_DIR}${file}`);

/** The file name at the end of a shipped `src`, e.g. `/screenshots/x.webp`. */
const basename = (src: string) => src.slice(src.lastIndexOf("/") + 1);

const README = readFileSync(`${SOURCE_DIR}../../README.md`, "utf8");

/** Every `<picture>` block the README carries, as `{ alt, files }`. */
const readmePictures = [...README.matchAll(/<picture>([\s\S]*?)<\/picture>/g)].map((match) => {
  const block = match[1] as string;
  return {
    alt: block.match(/<img[^>]*\salt="([^"]*)"/)?.[1] ?? "",
    files: [...block.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => basename(m[1] as string)),
  };
});

describe("the source images", () => {
  it("are the pairs the capture commits, both schemes and one size", () => {
    // The pairing is what the page's `<picture>` swaps on, so a source
    // directory holding a light frame with no dark one — or two frames laid
    // out at different sizes — is a page that jumps when the reader's scheme
    // changes. Read from the directory rather than from a list, so a surface
    // added to the capture arrives here without an edit.
    expect(sources.length).toBeGreaterThan(1);

    for (const shot of sources) {
      expect(shot.width, shot.name).toBeGreaterThan(0);
      expect(shot.height, shot.name).toBeGreaterThan(0);
      for (const scheme of SCHEMES) {
        expect(basename(shot[scheme].src), shot.name).toBe(`${shot.name}-${scheme}.webp`);
      }
    }
  });
});

describe("the shipped copies", () => {
  it("are byte-for-byte the images the README shows", () => {
    for (const shot of sources) {
      for (const scheme of SCHEMES) {
        const file = basename(shot[scheme].src);
        expect(shippedBytes(file).equals(sourceBytes(file)), file).toBe(true);
      }
    }
  });

  it("hold nothing the capture did not write", () => {
    // A renamed surface leaves its old frames behind, and a stale copy still
    // serves 200 to whatever still links at it. The command rewrites the
    // directory rather than adding to it; this is that property, asserted.
    const shipped = readdirSync(SHIPPED_DIR).sort();
    const expected = sources.flatMap((shot) => SCHEMES.map((s) => basename(shot[s].src))).sort();

    expect(shipped).toStrictEqual(expected);
  });

  it("are what the generated module says they are", () => {
    // The one assertion that makes the copies *generated* rather than
    // hand-placed: the module is rendered again, here, from the sources on
    // disk, and compared to the file in the tree. A re-capture nobody synced
    // fails on the digests; an edit to the module fails on everything.
    expect(readFileSync(GENERATED_MODULE, "utf8")).toBe(renderGeneratedModule(sources));
  });

  it("say so, and name the command that writes them", () => {
    const generated = readFileSync(GENERATED_MODULE, "utf8");

    expect(generated).toMatch(/GENERATED FILE/);
    expect(generated).toMatch(/do not edit/i);
    expect(generated).toContain(SYNC_COMMAND);
  });

  it("are written by a command the repo actually has, and documents", () => {
    const script = SYNC_COMMAND.replace(/^bun run /, "");
    const manifest = JSON.parse(readFileSync(`${SOURCE_DIR}../../package.json`, "utf8"));
    const skill = readFileSync(
      `${SOURCE_DIR}../../.claude/skills/demo-screenshots/SKILL.md`,
      "utf8",
    );

    expect(Object.keys(manifest.scripts)).toContain(script);
    // The capture skill is where somebody stands when the images change, so it
    // is where the sync step has to be written down — a capture that stops
    // there leaves the deployed page showing the previous release.
    expect(skill).toContain(SYNC_COMMAND);
  });
});

describe("the weight the page ships", () => {
  it("stays under the ceiling, in total and per scheme", () => {
    // Two numbers, because they answer different questions: the total is what
    // the image carries and the container serves, and the per-scheme figure is
    // what one reader actually downloads — the `<picture>` fetches one frame of
    // each pair, never both.
    expect(totalBytes(SHIPPED_SCREENSHOTS)).toBeLessThanOrEqual(TOTAL_BYTE_CEILING);

    for (const scheme of SCHEMES) {
      expect(schemeBytes(SHIPPED_SCREENSHOTS, scheme), scheme).toBeLessThanOrEqual(
        PER_SCHEME_BYTE_CEILING,
      );
    }
    expect(overCeiling(SHIPPED_SCREENSHOTS)).toBeNull();
  });

  it("is a ceiling that bites, and says what the trade-off is", () => {
    // The guard is worth nothing if it only ever reports "fine". A pair
    // weighing the ceiling on its own is what a third surface, or a
    // re-capture at higher quality, looks like — and the command refuses to
    // write it rather than quietly growing the page.
    const heavy = SHIPPED_SCREENSHOTS.map((shot) => ({
      ...shot,
      light: { ...shot.light, bytes: TOTAL_BYTE_CEILING },
      dark: { ...shot.dark, bytes: TOTAL_BYTE_CEILING },
    }));

    expect(overCeiling(heavy)).toContain(String(TOTAL_BYTE_CEILING));
  });
});

describe("both surfaces", () => {
  it("show the same images", () => {
    // The point of the copies. The README names files under `docs/`, the page
    // names URLs under `/screenshots/`; what has to match is the file at the
    // end of each, in both schemes.
    const shipped = sources.flatMap((shot) => SCHEMES.map((s) => basename(shot[s].src))).sort();
    const shown = readmePictures.flatMap((picture) => picture.files).sort();

    expect(shown).toStrictEqual(shipped);
  });

  it("describe them the same way", () => {
    // Two documents, one description. The alt text is written by hand in both
    // places — the README's `<img>` and `src/content/screenshots.ts` — because
    // neither document is generated from the other; holding them equal is what
    // stops a re-worded screenshot from being described two ways.
    expect(SCREENSHOTS.shots.length).toBe(readmePictures.length);

    for (const copy of SCREENSHOTS.shots) {
      const picture = readmePictures.find((p) =>
        p.files.some((f) => f.startsWith(`${copy.name}-`)),
      );

      expect(picture, copy.name).toBeDefined();
      expect(picture?.alt, copy.name).toBe(copy.alt);
    }
  });

  it("carry copy for every pair the capture produces, and for no other", () => {
    // A surface added to the capture arrives in the generated module on the
    // next sync, with no words to introduce it. That is this failure, rather
    // than a figure captioned with its own file name.
    expect(SCREENSHOTS.shots.map((shot) => shot.name).sort()).toStrictEqual(
      SHIPPED_SCREENSHOTS.map((shot) => shot.name).sort(),
    );
  });
});
