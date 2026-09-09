import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEVICE_SCALE_FACTOR,
  OUTPUT_DIR,
  SHOTS,
  shotUrl,
  SURFACES,
  THEMES,
  VIEWPORT,
} from "../../../../.claude/skills/demo-screenshots/shots";

/**
 * The published screenshots (issue #144), and the shot list that produces them.
 *
 * Four images — Transactions and Recap, each in both colour schemes — are
 * committed under `docs/screenshots/` and displayed by the README. The capture
 * itself needs a browser and a running demo stack, so it cannot happen here;
 * what *can* happen here is everything that outlives the capture:
 *
 * - the **shot list** (`.claude/skills/demo-screenshots/shots.ts`), which is the
 *   pure half of the pipeline — the surfaces, the pinned viewport, the URL each
 *   frame is taken at. A pair that disagrees about any of those is the failure
 *   the issue describes: swapping the two on the reader's colour scheme looks
 *   like a glitch rather than a theme change;
 * - the **committed files**, read as bytes: a pair must agree on dimensions, and
 *   those dimensions must be the pinned viewport times the pinned scale. An
 *   image captured at some other size is one somebody took by hand;
 * - the **skill** that documents the procedure, and the script it tells the
 *   reader to run, which has to exist in the root manifest.
 *
 * What no test here can assert is what the images *show* — that is checked at
 * capture time, where the page is in front of the browser: `capture.ts` compares
 * the two frames of a pair on their text content before it writes either.
 *
 * Paths are cwd-relative, as in `docker-compose-demo.test.ts`: vitest runs from
 * the package root, so the repo root is `../..`.
 */

const ROOT = "../..";

const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");
const rootPath = (path: string) => `${ROOT}/${path}`;

const SKILL_DIR = ".claude/skills/demo-screenshots";
const rootScripts = (): Record<string, string> => JSON.parse(read("package.json")).scripts;

/**
 * The pixel size of a WebP file, read out of its header rather than decoded: a
 * RIFF container whose fourth chunk word is `WEBP`, then one of the three
 * bitstream chunks. Only `VP8L` (lossless) and `VP8X` (extended) carry the size
 * in a shape worth parsing here; `VP8 ` (lossy) is what `Page.captureScreenshot`
 * emits, so all three are handled.
 */
function webpSize(path: string): { width: number; height: number; lossy: boolean } {
  const bytes = readFileSync(path);

  expect(bytes.toString("ascii", 0, 4), path).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12), path).toBe("WEBP");

  const chunk = bytes.toString("ascii", 12, 16);

  if (chunk === "VP8 ") {
    // Lossy: a 10-byte frame header, then 14 bits of width and 14 of height.
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
      lossy: true,
    };
  }
  if (chunk === "VP8L") {
    // Lossless: 14 bits each, packed across the four bytes after the signature.
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, lossy: false };
  }
  // Extended: canvas size as two 24-bit values, each stored minus one.
  expect(chunk, path).toBe("VP8X");
  return {
    width: (bytes.readUIntLE(24, 3) & 0xffffff) + 1,
    height: (bytes.readUIntLE(27, 3) & 0xffffff) + 1,
    lossy: false,
  };
}

describe("the shot list", () => {
  it("shoots the two surfaces the README says are worth showing", () => {
    expect(SURFACES.map((surface) => surface.name)).toStrictEqual(["transactions", "recap"]);
  });

  it("takes every surface in both schemes, and nothing twice", () => {
    expect(SHOTS).toHaveLength(SURFACES.length * THEMES.length);
    expect(new Set(SHOTS.map((shot) => shot.file)).size).toBe(SHOTS.length);

    for (const surface of SURFACES) {
      const pair = SHOTS.filter((shot) => shot.surface.name === surface.name);
      expect(
        pair.map((shot) => shot.theme),
        surface.name,
      ).toStrictEqual([...THEMES]);
    }
  });

  it("pins one viewport for every frame, which is what makes a pair swappable", () => {
    // The two frames of a pair are laid out by the viewport, not by the file
    // they end up in: a surface that shot itself at some other width would
    // reflow, and swapping the two on the reader's colour scheme would move the
    // page under them.
    expect(VIEWPORT.width).toBeGreaterThan(0);
    expect(VIEWPORT.height).toBeGreaterThan(0);
    expect(DEVICE_SCALE_FACTOR).toBeGreaterThanOrEqual(2);

    // The capture viewport decides legibility, not the output width: at some
    // desktop-sized width the app lays itself out for a monitor nobody views
    // the README on, and the text arrives too small to read.
    expect(VIEWPORT.width).toBeLessThanOrEqual(1440);
  });

  it("forces its scheme on the URL, so the frame does not depend on the machine", () => {
    // `?theme=` is the app's documented capture switch (packages/web/CONTEXT.md,
    // issue #143): it writes the key `next-themes` reads, so the choice survives
    // the reload the pipeline does between frames. Without it the scheme comes
    // from whatever the capturing machine prefers.
    for (const shot of SHOTS) {
      const url = new URL(shotUrl("http://localhost:5400/app", shot));

      expect(url.searchParams.get("theme"), shot.file).toBe(shot.theme);
    }
  });

  it("pins every search param a surface needs, rather than taking a default", () => {
    // Recap's default period is the *current* month, and the demo dataset ends
    // in a fixed one — six months of 2026, pinned so two runs are the same app
    // (`packages/api/src/demo/dataset.ts`). A frame taken on the default lands
    // on an empty month as soon as the clock passes the data.
    const recap = SHOTS.find((shot) => shot.surface.name === "recap");

    expect(new URL(shotUrl("http://localhost:5400/app", recap!)).searchParams.get("period")).toBe(
      "year",
    );
    expect(read("packages/api/src/demo/dataset.ts")).toContain(
      `"${recap!.surface.search.year}-01"`,
    );
  });

  it("waits on something each surface only shows once its data is in", () => {
    for (const surface of SURFACES) {
      expect(surface.ready.trim(), surface.name).not.toBe("");
      expect(surface.path.startsWith("/"), surface.name).toBe(true);
    }
  });

  it("writes both frames of a pair into the same directory, named for the scheme", () => {
    for (const shot of SHOTS) {
      expect(shot.file).toBe(`${shot.surface.name}-${shot.theme}.webp`);
    }
    expect(existsSync(rootPath(OUTPUT_DIR))).toBe(true);
  });
});

describe("the published images", () => {
  it("are all there, in the format the shot list names", () => {
    for (const shot of SHOTS) {
      expect(existsSync(rootPath(`${OUTPUT_DIR}/${shot.file}`)), shot.file).toBe(true);
    }
  });

  it("were captured at the pinned viewport, at the pinned scale", () => {
    for (const shot of SHOTS) {
      const size = webpSize(rootPath(`${OUTPUT_DIR}/${shot.file}`));

      expect(size.width, shot.file).toBe(VIEWPORT.width * DEVICE_SCALE_FACTOR);
      expect(size.height, shot.file).toBe(VIEWPORT.height * DEVICE_SCALE_FACTOR);
    }
  });

  it("match, frame for frame, within a pair", () => {
    // The reader swaps between these two on their own colour scheme. Anything
    // that differs between them other than the palette — a scrollbar, a
    // reflowed row, a different scroll position — reads as a glitch.
    for (const surface of SURFACES) {
      const sizes = THEMES.map((theme) =>
        webpSize(rootPath(`${OUTPUT_DIR}/${surface.name}-${theme}.webp`)),
      );

      expect(sizes[0], surface.name).toStrictEqual(sizes[1]);
    }
  });

  it("differ within a pair, which is the whole reason there are two", () => {
    // Everything else here would pass if the scheme had never been forced and
    // both frames were the same screen twice: the sizes match, the files exist,
    // and `capture.ts`'s own comparison is *of the text*, which is identical
    // between schemes by design. Two frames that are byte-for-byte equal are a
    // `?theme=` that silently did nothing (issue #143) — the reader's dark mode
    // would then swap one light screenshot for another.
    for (const surface of SURFACES) {
      const [light, dark] = THEMES.map((theme) =>
        readFileSync(rootPath(`${OUTPUT_DIR}/${surface.name}-${theme}.webp`)),
      );

      expect(light.equals(dark), surface.name).toBe(false);
    }
  });

  it("stay small enough to ship in a README", () => {
    // A repo everybody clones is the wrong place for a megabyte of PNG. WebP at
    // the capture quality holds a full-screen app view well under this.
    for (const shot of SHOTS) {
      const bytes = statSync(rootPath(`${OUTPUT_DIR}/${shot.file}`)).size;

      expect(bytes, shot.file).toBeLessThan(500_000);
    }
  });
});

describe("the README", () => {
  it("displays both frames of both pairs", () => {
    const readme = read("README.md");

    for (const shot of SHOTS) {
      expect(readme, shot.file).toContain(`${OUTPUT_DIR}/${shot.file}`);
    }
  });

  it("lets the reader's own scheme pick the frame", () => {
    // GitHub honours `<picture>` with a `prefers-color-scheme` source, which is
    // the whole reason a pair is captured rather than one image.
    expect(read("README.md")).toContain('media="(prefers-color-scheme: dark)"');
  });

  it("no longer promises the screenshots as a TODO", () => {
    expect(read("README.md")).not.toMatch(/TODO: screenshots/);
  });
});

describe("the skill", () => {
  const skill = () => read(`${SKILL_DIR}/SKILL.md`);

  it("is a skill, with the frontmatter that makes it discoverable", () => {
    const frontmatter = skill().match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

    expect(frontmatter).toMatch(/^name: demo-screenshots$/m);
    expect(frontmatter).toMatch(/^description: .+/m);
  });

  it("tells the reader to run scripts the root manifest has", () => {
    const scripts = Object.keys(rootScripts());

    for (const [, script] of skill().matchAll(/bun run ([\w:-]+)/g)) {
      expect(scripts, script).toContain(script);
    }
  });

  it("runs the capture through a root script, which points at the file beside it", () => {
    const shots = rootScripts()["demo:shots"];

    expect(shots).toContain(`${SKILL_DIR}/capture.ts`);
    expect(existsSync(rootPath(`${SKILL_DIR}/capture.ts`))).toBe(true);
  });

  it("tears the stack down whatever happened, not only on the happy path", () => {
    // The failure the issue names: a capture that threw leaves containers, a
    // volume and two images on the machine. The teardown is therefore a trap,
    // not the last line of a `&&` chain.
    expect(skill()).toContain("trap");
    expect(skill()).toContain(rootScripts()["demo:down"] ? "bun run demo:down" : "demo:down");
  });

  it("states its prerequisites and the ways a capture goes wrong", () => {
    const text = skill().toLowerCase();

    for (const word of ["prerequisite", "docker", "chrome", "viewport", "failure"]) {
      expect(text, word).toContain(word);
    }
  });
});
