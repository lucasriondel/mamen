import { readFileSync } from "node:fs";
import { ANALYTICS } from "@mamen/shared";
import { describe, expect, it } from "vitest";

/**
 * The visit counter in the SPA's shell.
 *
 * The site root and `/app` are one host served by two containers, so the
 * landing page and this shell must load the same tracker with the same website
 * id, or the site's visits split across two dashboards. The landing page reads
 * `ANALYTICS` while it renders; `index.html` cannot import anything, so it
 * repeats the values and this is what holds that copy to the constant.
 *
 * Paths are cwd-relative, as in `color-scheme.test.ts`: vitest runs from the
 * package root.
 */

const html = readFileSync("index.html", "utf8");
const head = html.slice(0, html.indexOf("</head>"));
const tags = head.match(/<script\b[^>]*\bsrc="[^"]*"[^>]*>/g) ?? [];
const tracker = tags.find((tag) => tag.includes(ANALYTICS.src));

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] as string | undefined;

describe("the shell's visit counter", () => {
  it("is in the head, once", () => {
    expect(tracker).toBeDefined();
    expect(tags.filter((tag) => tag.includes(ANALYTICS.src))).toHaveLength(1);
  });

  it("carries the landing page's website id and host filter", () => {
    const tag = tracker as string;
    expect(attr(tag, "data-website-id")).toBe(ANALYTICS.websiteId);
    expect(attr(tag, "data-domains")).toBe(ANALYTICS.domains);
  });

  it("is deferred, so it never holds up the app's own bundle", () => {
    expect(tracker as string).toMatch(/\sdefer\s/);
  });
});
