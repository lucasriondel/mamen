import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, type IndexHtmlTransformContext, type UserConfig } from "vite";
import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config";
import { renderPage } from "../page";
import { prerender } from "../prerender";
import { renderPreviewPage } from "./render";
import { PREVIEW_ENTRY, PREVIEW_ROUTE } from "./route";

/**
 * The preview route, from the build that ships it (issue #145).
 *
 * The expand step's whole claim is that the new renderer is *reachable* —
 * built, prerendered, and sitting in `dist` beside the page that still owns the
 * root. So this suite runs the real Vite build rather than asserting on config
 * shape alone: the config could name the entry and the plugin could still hand
 * it the wrong document, and no unit test of either would notice.
 *
 * `write: false` keeps it in memory — the assertion is on the bundle Vite
 * produced, not on whatever `dist/` happens to hold from a previous run.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const config = viteConfig as UserConfig;

const input = config.build?.rollupOptions?.input as Record<string, string>;

const stub = readFileSync(fileURLToPath(new URL(`../../${PREVIEW_ENTRY}`, import.meta.url)), "utf8");

const plugin = prerender();

const hook = plugin.transformIndexHtml as {
  order?: "pre" | "post";
  handler: (html: string, ctx: IndexHtmlTransformContext) => Promise<unknown>;
};

/** The transform context Vite hands the hook for one of the two entries. */
const ctx = (path: string) => ({ path, filename: path.slice(1) }) as IndexHtmlTransformContext;

describe("the prerender plugin", () => {
  it("hands the preview entry the React page", async () => {
    expect(await hook.handler(stub, ctx(`${PREVIEW_ROUTE}index.html`))).toBe(
      await renderPreviewPage(),
    );
  });

  it("still hands the root entry the string page", async () => {
    // The expand step's first promise: the site root does not move, and no
    // request that reaches it renders through React.
    expect(await hook.handler("", ctx("/index.html"))).toBe(renderPage());
  });

  it("answers a bare directory request too", async () => {
    // Vite resolves `/preview/` to `/preview/index.html` before this hook
    // runs, so today both spellings arrive the same way and `dev.test.ts` is
    // what proves the route actually serves. This holds the dispatch to the
    // prefix rather than to the file name anyway: it is one `startsWith`, and
    // the alternative is a match that depends on a normalisation step in Vite
    // that this package neither owns nor asserts.
    expect(await hook.handler(stub, ctx(PREVIEW_ROUTE))).toBe(await renderPreviewPage());
  });
});

describe("the build's entries", () => {
  it("keeps the root entry and adds the preview one beside it", () => {
    expect(Object.values(input)).toStrictEqual(["index.html", PREVIEW_ENTRY]);
  });

  it("builds the preview entry to the route it is served at", () => {
    // `dist/preview/index.html` is what nginx resolves `/preview/` to, with
    // the `index index.html` it already declares — so the route needs no
    // location block of its own, and the entry path may not drift from it.
    expect(PREVIEW_ENTRY).toBe(`${PREVIEW_ROUTE.slice(1)}index.html`);
  });

  it("is a stub, not a second copy of the page", () => {
    expect(stub).not.toMatch(/<h1\b/);
    expect(stub).not.toMatch(/<link\b/);
    expect(stub).not.toMatch(/<script\b/);
  });

  it("points at the module that does own the page", () => {
    expect(stub).toMatch(/src\/preview\//);
  });
});

describe("the landing nginx config", () => {
  const nginx = readFileSync("nginx.conf", "utf8");

  it("resolves the preview route without a location of its own", () => {
    // `/preview/` is a directory in `dist`, so the existing root block
    // already answers it: `try_files` tries the directory and `index` names
    // the file inside it. A `location /preview/` would be a second opinion
    // about routing, and it would have to be removed again at the contract
    // step.
    expect(nginx).toMatch(/^\s*index\s+index\.html;/m);
    const block = nginx.match(/location\s+\/\s*\{([^}]*)\}/)?.[1];
    expect(block).toMatch(/try_files\s+\$uri\s+\$uri\/\s/);
  });
});

describe("the built site", async () => {
  const output = await build({
    configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
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

  it("emits both pages", () => {
    expect(html("index.html")).toBeDefined();
    expect(html(PREVIEW_ENTRY)).toBeDefined();
  });

  it("carries the React page's content in the bytes, with no JavaScript to run", () => {
    // This is the acceptance criterion the whole slice turns on: the text is
    // in the built HTML, and there is no script tag to assemble it.
    const page = html(PREVIEW_ENTRY) as string;
    expect(page).toMatch(/<h1[^>]*>mamen<\/h1>/);
    expect(page).toMatch(/single-user/i);
    expect(page).not.toMatch(/<script\b/);
  });

  it("rewrites the preview page's stylesheet to the hashed asset", () => {
    // The `pre` ordering is what leaves Vite's HTML pass still to come; a
    // link to `/src/styles.css` in `dist` is a 404 on the deployed site.
    const page = html(PREVIEW_ENTRY) as string;
    expect(page).not.toMatch(/\/src\/styles\.css/);
    expect(page).toMatch(/href="\/assets\/[\w.-]+\.css"/);
  });

  it("leaves the root page prerendered as it was", () => {
    const page = html("index.html") as string;
    expect(page).not.toMatch(/<script\b/);
    expect(page).toMatch(/href="\/assets\/[\w.-]+\.css"/);
    expect(page).toMatch(/<h1>mamen<\/h1>/);
  });
}, 60_000);
