import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, type UserConfig } from "vite";
import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config";
import { HERO } from "./content";

/**
 * The site root, from the build that ships it (issues #145, #148).
 *
 * The expand step's claim was that the React renderer is *reachable* — built,
 * prerendered, and sitting in `dist` beside the page that owned the root. The
 * contract step's is that it **is** the root, and that the temporary route it
 * arrived on is not in the output at all. So this suite runs the real Vite
 * build rather than asserting on config shape alone: the config could name the
 * entry and the plugin could still hand it the wrong document, and no unit test
 * of either would notice.
 *
 * `write: false` keeps it in memory — the assertion is on the bundle Vite
 * produced, not on whatever `dist/` happens to hold from a previous run. That
 * matters more here than it did: a stale `dist/preview/index.html` from before
 * the contract is exactly the artifact this suite is asked about.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const config = viteConfig as UserConfig;

const stub = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

describe("the build's entries", () => {
  it("names none: one page means Vite's own default entry", () => {
    // `rollupOptions.input` was the expand step's second, temporary entry
    // listed beside the root one. With the preview route gone there is one
    // page again, and naming it would be a second place for its path to live.
    expect(config.build?.rollupOptions?.input).toBeUndefined();
  });

  it("is a stub, not a second copy of the page", () => {
    expect(stub).not.toMatch(/<h1\b/);
    expect(stub).not.toMatch(/<link\b/);
    expect(stub).not.toMatch(/<script\b/);
  });

  it("points at the module that does own the page", () => {
    expect(stub).toMatch(/src\/page\.tsx/);
  });
});

describe("the built site", async () => {
  const output = await build({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    logLevel: "silent",
    build: { write: false },
  });

  const chunks = (Array.isArray(output) ? output : [output]).flatMap((result) =>
    "output" in result ? [...result.output] : [],
  );

  const html = (fileName: string) => {
    const asset = chunks.find((chunk) => chunk.fileName === fileName);
    return asset && "source" in asset ? String(asset.source) : undefined;
  };

  it("emits the one page, at the root", () => {
    expect(html("index.html")).toBeDefined();
    expect(chunks.filter((chunk) => chunk.fileName.endsWith(".html"))).toHaveLength(1);
  });

  it("carries the page's content in the bytes, with no JavaScript to run", () => {
    // This is the criterion the whole expand–contract turns on: the text is in
    // the built HTML, and there is no script tag to assemble it. React ran in
    // Node and nothing of it is in the output.
    const page = html("index.html") as string;
    expect(page).toContain(`<h1>${HERO.heading}</h1>`);
    expect(page).toMatch(/single-user/i);
    expect(page).not.toMatch(/<script\b/);
    expect(chunks.filter((chunk) => chunk.fileName.endsWith(".js"))).toStrictEqual([]);
  });

  it("rewrites the page's stylesheet to the hashed asset", () => {
    // The `pre` ordering is what leaves Vite's HTML pass still to come; a
    // link to `/src/styles.css` in `dist` is a 404 on the deployed site.
    const page = html("index.html") as string;
    expect(page).not.toMatch(/\/src\/styles\.css/);
    expect(page).toMatch(/href="\/assets\/[\w.-]+\.css"/);
  });

  it("emits nothing at the route the React page arrived on", () => {
    // The temporary route is the thing the contract step is *for*. It has no
    // nginx block of its own — it resolved because `dist/preview/` was a
    // directory with an index in it — so nothing else would report it still
    // being deployed.
    for (const chunk of chunks) expect(chunk.fileName).not.toMatch(/^preview\//);
  });
});
