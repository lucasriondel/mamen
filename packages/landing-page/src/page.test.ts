import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_BASE_PATH, APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";
import { describe, expect, it } from "vitest";
import { CONTRIBUTING, HERO, INSTALL, SCREENSHOTS, screenshotFigures } from "./content";
import { renderPage } from "./page";
import { SHIPPED_DIR, SHIPPED_URL_PREFIX } from "./screenshots/manifest";

/**
 * The landing page is the public root of the deployed site (issue #113): the
 * app moved under `/app` in #111, and this is what a visitor gets at `/`.
 *
 * It is **prerendered** — `renderPage()` returns the finished markup and the
 * build writes it into `index.html`, so what nginx serves is a document, not a
 * shell waiting for JavaScript. That is why these assertions read the string
 * rather than a DOM: the string *is* the artifact. React renders it, in Node,
 * at build time (issue #148); what that swap of renderer may not spend is any
 * of the properties below, which is why this suite is the string page's own
 * with the React renderer's folded into it.
 *
 * The one fact this page shares with the app is the prefix its link points at,
 * and it is derived from `APP_BASE_PATH` rather than written out — the whole
 * point of the constant is that nobody repeats it in a place a rename cannot
 * reach.
 */

const html = await renderPage();

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** Every `href="…"` the page carries, in order. */
const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] as string);

/**
 * One attribute of one tag.
 *
 * Matched case-insensitively because React writes the name it was given —
 * `srcSet`, `charSet` — and HTML parses attribute names case-insensitively, so
 * the browser reads `srcset` either way. Asserting on the casing would be a
 * test of React's spelling rather than of the page.
 */
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] as string | undefined;

/** Every `<picture>` the page renders, as its dark `<source>` and its `<img>`. */
const pictures = [...html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/g)].map((match) => {
  const block = match[1] as string;
  return {
    source: block.match(/<source\b[^>]*>/)?.[0] ?? "",
    img: block.match(/<img\b[^>]*>/)?.[0] ?? "",
  };
});

describe("the landing page", () => {
  it("carries the content React rendered, not an empty shell", () => {
    // The point of the whole exercise: the components ran at build time, so
    // the text is in the bytes a browser downloads.
    //
    // Read from the content module rather than spelled out: the headline is a
    // sentence someone will reword, and an assertion carrying its own copy of
    // it fails the day they do — for no reason connected to what it tests.
    expect(html).toContain(`<h1>${HERO.heading}</h1>`);
  });

  it("links into the app under its prefix", () => {
    // The link is the page's job: a visitor at the root has to be able to
    // reach the app, which is no longer at the root.
    expect(hrefs).toContain(APP_BASE_PATH_SLASH);
  });

  it("reads the prefix from the constant rather than restating it", () => {
    // The link is content, not markup, so it moved into the module that holds
    // the page's destinations (issue #147). A hand-written `/app` in either
    // file is a fifth copy of the literal, in the one place whose whole job is
    // linking at it.
    expect(source("./content/actions.ts")).toMatch(/APP_BASE_PATH_SLASH/);
    for (const file of ["./page.tsx", "./content/actions.ts"]) {
      expect(source(file)).not.toContain(`"${APP_BASE_PATH}`);
      expect(source(file)).not.toContain(`'${APP_BASE_PATH}`);
    }
  });

  it("renders the install guide, which is the only call to action it has", () => {
    // There is nothing to sign up for, so "run it yourself" is the offer —
    // and a guide missing a step is a reader stuck at a shell prompt.
    expect(html).toContain(`<h2>${INSTALL.heading}</h2>`);
    expect(html.match(/<pre>/g)).toHaveLength(INSTALL.steps.length);
    for (const step of INSTALL.steps) {
      expect(html).toContain(`<h3>${step.title}</h3>`);
    }
    expect(html).toContain(`<h2>${CONTRIBUTING.heading}</h2>`);
  });

  it("escapes the content instead of writing it through as markup", () => {
    // React escapes what it renders, so this is no longer a hand-written
    // `escape()` under test — it is the property that made deleting one safe.
    // The key placeholder is the case that bites: written through raw, its
    // angle brackets are a tag the browser swallows, taking the half of the
    // line that tells a reader what to generate with it.
    const placeholder = INSTALL.steps.flatMap((step) => step.commands).find((c) => c.includes("<"));
    expect(placeholder).toBeDefined();
    expect(html).not.toContain(placeholder);
    expect(html).toContain((placeholder as string).replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  });

  it("says what mamen is, and does not oversell it", () => {
    // The README's own framing (single-user, self-hosted, not a product);
    // the landing page is the first thing a stranger reads and the failure
    // mode is a page that implies a signup.
    expect(html).toMatch(/mamen/);
    expect(html).toMatch(/self-hosted/i);
    expect(html).toMatch(/single-user/i);
    expect(html).not.toMatch(/sign up|sign-up|free trial|pricing/i);
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

  it("names the product in the wordmark and says what it is for in the h1", () => {
    // These were one field, and the first screen printed "mamen" twice: once
    // as the mark and once as the headline under the screenshot. They are two
    // now, and this is what keeps them two — a headline reset to the product
    // name reads as a design decision in a diff and as a repeat on the page.
    expect(HERO.name).not.toBe(HERO.heading);
    expect(html).toContain(`<span>${HERO.name}</span>`);
    expect(html).toContain(`<h1>${HERO.heading}</h1>`);
  });

  it("needs no JavaScript to say any of it", () => {
    // Prerendered means the text is in the bytes nginx sends. A `<script>`
    // here would mean the content is assembled in the browser, which is the
    // thing this package exists not to do — and the property the port to React
    // was not allowed to spend.
    expect(html).not.toMatch(/<script\b/);
  });

  it("leaves the root paths it does not own alone", () => {
    // `/api` and `/uploads` are the API's, proxied by the *web* container's
    // nginx; the landing container serves neither and must not link at them.
    for (const href of hrefs) {
      expect(href.startsWith("/api")).toBe(false);
      expect(href.startsWith("/uploads")).toBe(false);
    }
  });

  it("links the stylesheet at its source path, for Vite to rewrite", () => {
    // Vite's HTML pass turns this into the hashed asset. A `<style>` block
    // instead would inline CSS into a document nginx serves `no-store`, so a
    // repeat visitor would download it again on every page load.
    expect(hrefs).toContain("/src/styles.css");
  });
});

describe("the screenshots the page shows", () => {
  it("shows every surface, swapping frames on the reader's colour scheme", () => {
    // The page's half of issue #149: a visitor sees what the app looks like
    // without running it, in the scheme they are already reading in. The
    // swap is `<picture>` and a media query rather than a script, which is
    // the only mechanism a page shipping no JavaScript has.
    // Every surface is in the hero now, cross-faded in one frame, so the page
    // carries each `<picture>` exactly once — a section repeating them is the
    // thing that was removed.
    expect(pictures).toHaveLength(SCREENSHOTS.shots.length);
    expect(pictures.length).toBeGreaterThan(1);

    for (const [index, figure] of screenshotFigures().entries()) {
      const picture = pictures[index] as (typeof pictures)[number];

      expect(attr(picture.source, "media"), figure.name).toBe("(prefers-color-scheme: dark)");
      expect(attr(picture.source, "srcset"), figure.name).toBe(figure.dark.src);
      expect(attr(picture.img, "src"), figure.name).toBe(figure.light.src);
    }
  });

  it("describes the surface it leads with, and hides the ones that replace it", () => {
    // The frames swap themselves visually, so announcing all of them would
    // read a screen-reader user two descriptions of one picture. The leading
    // surface carries the README's alt text — held equal in
    // `screenshots/sync.test.ts` — and the rest are decoration by then.
    const [leading, ...rest] = pictures;
    const [first] = screenshotFigures();

    expect(attr((leading as (typeof pictures)[number]).img, "alt")).toBe(first?.alt);
    expect(attr((leading as (typeof pictures)[number]).img, "aria-hidden")).toBeUndefined();

    expect(rest.length).toBeGreaterThan(0);
    for (const picture of rest) {
      expect(attr(picture.img, "alt")).toBe("");
      expect(attr(picture.img, "aria-hidden")).toBe("true");
    }
  });

  it("defers every frame but the one a visitor opens on", () => {
    // The first frame is above every fold and deferring it is how a page
    // renders empty; the others are not needed until the cycle reaches them.
    const loading = pictures.map((picture) => attr(picture.img, "loading"));

    expect(loading[0]).toBe("eager");
    expect(loading.slice(1).every((value) => value === "lazy")).toBe(true);
  });

  it("reserves the space each image takes before it loads", () => {
    // The intrinsic size, from the generated module: without it the caption
    // and everything below it sit under a zero-height box and jump down when
    // the image arrives, which is the worst thing a heavy image does to a
    // page. The CSS scales it back down (`styles.test.ts`).
    for (const [index, figure] of screenshotFigures().entries()) {
      const { img } = pictures[index] as (typeof pictures)[number];

      expect(attr(img, "width"), figure.name).toBe(String(figure.width));
      expect(attr(img, "height"), figure.name).toBe(String(figure.height));
    }
  });

  it("loads them from the copies the container serves, not from the repository", () => {
    // The deployed page is a different origin from the repository host and is
    // built from a context that excludes `docs/` (`.dockerignore`), so a URL
    // pointing at the README's own files is a broken image on the live site.
    // Every frame is a file `public/` carries, which Vite copies into `dist`
    // verbatim.
    const frames = pictures.flatMap((picture) => [
      attr(picture.source, "srcset") ?? "",
      attr(picture.img, "src") ?? "",
    ]);
    expect(frames).toHaveLength(pictures.length * 2);

    for (const frame of frames) {
      expect(frame.startsWith(`${SHIPPED_URL_PREFIX}/`), frame).toBe(true);
      expect(existsSync(`${SHIPPED_DIR}${frame.slice(SHIPPED_URL_PREFIX.length + 1)}`), frame).toBe(
        true,
      );
    }
  });
});
