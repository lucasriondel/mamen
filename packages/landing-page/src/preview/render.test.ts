import { APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";
import { describe, expect, it } from "vitest";
import { renderPreviewPage } from "./render";

/**
 * The React renderer, standing beside the string one (issue #145).
 *
 * This is the **expand** half of an expand–contract: `src/page.ts` still owns
 * the site root and none of its tests move, while everything under
 * `src/preview/` builds the same page a second way — React components on a
 * TanStack router — and answers a temporary route. The contract half swaps the
 * root over and deletes the loser; until then both exist and both are asserted.
 *
 * What may not change across that swap is the artifact: `renderPreviewPage()`
 * returns a finished document, rendered at **build** time, with no script tag
 * in it. React is a build-time dependency here, not a runtime one — the
 * assertions below are the ones that keep it that way.
 */

const html = await renderPreviewPage();

/** Every `href="…"` the page carries, in order. */
const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] as string);

describe("the preview page", () => {
  it("carries the content React rendered, not an empty shell", () => {
    // The point of the whole exercise: the components ran at build time, so
    // the text is in the bytes a browser downloads.
    expect(html).toMatch(/<h1[^>]*>mamen<\/h1>/);
    expect(html).toMatch(/self-hosted/i);
    expect(html).toMatch(/single-user/i);
  });

  it("needs no JavaScript to say any of it", () => {
    // Same contract as the page it will replace: no hydration, nothing to
    // assemble in the browser, so no script tag survives into the document.
    expect(html).not.toMatch(/<script\b/);
  });

  it("is a document, not a fragment", () => {
    expect(html.trimStart().startsWith("<!doctype html>")).toBe(true);
    expect(html).toMatch(/<html lang="en"/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]+"/);
    expect(html).toMatch(/<\/html>\s*$/);
  });

  it("carries exactly one h1", () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it("links into the app under its prefix", () => {
    expect(hrefs).toContain(APP_BASE_PATH_SLASH);
  });

  it("leaves the root paths it does not own alone", () => {
    for (const href of hrefs) {
      expect(href.startsWith("/api")).toBe(false);
      expect(href.startsWith("/uploads")).toBe(false);
    }
  });

  it("links the stylesheet at its source path, for Vite to rewrite", () => {
    // Vite's HTML pass turns this into the hashed asset, exactly as it does
    // for the root entry. A `<style>` block instead would ship uncached CSS
    // twice over once both pages exist.
    expect(hrefs).toContain("/src/styles.css");
  });
});
