import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	APP_BASE_PATH,
	APP_BASE_PATH_SLASH,
} from "@mamen/shared/app-base-path";
import { describe, expect, it } from "vitest";
import { renderPage } from "./page";

/**
 * The landing page is the public root of the deployed site (issue #113): the
 * app moved under `/app` in #111, and this is what a visitor gets at `/`.
 *
 * It is **prerendered** — `renderPage()` returns the finished markup and the
 * build writes it into `index.html`, so what nginx serves is a document, not a
 * shell waiting for JavaScript. That is why these assertions read the string
 * rather than a DOM: the string *is* the artifact.
 *
 * The one fact this page shares with the app is the prefix its link points at,
 * and it is derived from `APP_BASE_PATH` rather than written out — the whole
 * point of the constant is that nobody repeats it in a place a rename cannot
 * reach.
 */

const html = renderPage();

const source = readFileSync(
	fileURLToPath(new URL("./page.ts", import.meta.url)),
	"utf8",
);

/** Every `href="…"` the page carries, in order. */
const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] as string);

describe("the landing page", () => {
	it("links into the app under its prefix", () => {
		// The link is the page's job: a visitor at the root has to be able to
		// reach the app, which is no longer at the root.
		expect(hrefs).toContain(APP_BASE_PATH_SLASH);
	});

	it("reads the prefix from the constant rather than restating it", () => {
		// A hand-written `/app` here is a fifth copy of the literal, in the one
		// file whose whole content is a link to it.
		expect(source).toMatch(/APP_BASE_PATH_SLASH/);
		expect(source).not.toContain(`"${APP_BASE_PATH}`);
		expect(source).not.toContain(`'${APP_BASE_PATH}`);
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

	it("needs no JavaScript to say any of it", () => {
		// Prerendered means the text is in the bytes nginx sends. A `<script>`
		// here would mean the content is assembled in the browser, which is the
		// thing this package exists not to do.
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
});
