import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { IndexHtmlTransformContext } from "vite";
import { describe, expect, it } from "vitest";
import { renderPage } from "./page";
import { prerender } from "./prerender";

/**
 * Prerendering, as this package means it: `renderPage()` runs at **build**
 * time and its output *is* `dist/index.html`. Nothing assembles the page in a
 * browser, so the container serves one static file and the text is in the
 * bytes.
 *
 * Vite needs an HTML entry on disk, so `index.html` exists — but it is a stub
 * the plugin replaces wholesale, and these tests pin that division: the stub
 * holds no copy of its own (a second source of the page would drift from the
 * first), and the hook runs `pre`, which is what leaves Vite's own HTML pass
 * still to come. That pass is what rewrites `/src/styles.css` to the hashed
 * asset; a `post` hook would hand it a document it has already finished with,
 * and the built page would ship a link to a source path that is not in `dist`.
 *
 * The hook took a second entry and dispatched on `ctx.path` while the two
 * renderers stood side by side (issue #145). With the string one deleted it
 * answers every entry the same way, which is why the context below is no longer
 * part of what is asserted.
 */

const entry = fileURLToPath(new URL("../index.html", import.meta.url));
const stub = readFileSync(entry, "utf8");

const plugin = prerender();

// Vite's own `IndexHtmlTransformHook` declares a plugin-context `this`, which a
// test has no honest way to supply; the shape below is the part being called.
const hook = plugin.transformIndexHtml as {
  order?: "pre" | "post";
  handler: (html: string, ctx: IndexHtmlTransformContext) => Promise<unknown>;
};

const ctx = {
  path: "/index.html",
  filename: entry,
} as IndexHtmlTransformContext;

describe("the prerender plugin", () => {
  it("runs before Vite's own HTML pass, so asset URLs are still rewritten", () => {
    expect(hook.order).toBe("pre");
  });

  it("replaces the entry with the rendered page", async () => {
    expect(await hook.handler(stub, ctx)).toBe(await renderPage());
  });

  it("names itself, so a build log says what wrote the page", () => {
    expect(plugin.name).toMatch(/prerender/);
  });
});

describe("index.html", () => {
  it("is a stub, not a second copy of the page", async () => {
    // Whatever the page says, it says in `src/page.tsx`. The entry exists
    // because Vite resolves the build from an HTML file.
    expect(stub).not.toMatch(/<h1\b/);
    expect(stub).not.toMatch(/<link\b/);
    expect(stub).not.toMatch(/<script\b/);
    expect(stub.length).toBeLessThan((await renderPage()).length / 2);
  });

  it("points at the module that does own the page", () => {
    expect(stub).toMatch(/src\/page\.tsx/);
  });
});
