import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DESCRIPTION, HEADING, LEAD, OPEN_APP, POINTS, SOURCE, TITLE } from "../copy";
import { renderPage } from "../page";
import { renderPreviewPage } from "./render";

/**
 * The two renderers, held to the same page (issue #145).
 *
 * Expand–contract only pays off if the contract step is a **swap**: the day
 * `/preview/` takes the root, a visitor should get the same words, and any
 * difference should have been a deliberate edit rather than a copy that drifted
 * while the two forms sat side by side. Both read `src/copy.ts`, and this is
 * what proves it — a literal pasted back into either renderer fails here.
 *
 * The comparison is on **text**, not markup: React escapes an apostrophe to
 * `&#x27;` and the string renderer writes it through, and the tags themselves
 * are exactly what is allowed to differ. So both sides are stripped to the
 * words a reader sees, with runs of whitespace collapsed — the string page
 * wraps its copy across lines and the React one does not.
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
};

const decode = (html: string) =>
  html.replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITIES[entity] as string);

/** What a reader takes from the body: no tags, no entities, one space. */
const text = (html: string) =>
  decode(html.replace(/<head\b[\s\S]*?<\/head>/i, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const titleOf = (html: string) => decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");

const descriptionOf = (html: string) =>
  decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const page = renderPage();
const preview = await renderPreviewPage();

describe("the string page and the React page", () => {
  it("say the same words", () => {
    expect(text(preview)).toBe(text(page));
  });

  it("say the words `src/copy.ts` holds, rather than their own", () => {
    const points = POINTS.flatMap((point) => [point.term, point.detail]);
    for (const line of [HEADING, LEAD, OPEN_APP, SOURCE, ...points]) {
      for (const html of [page, preview]) {
        expect(text(html)).toContain(text(line));
      }
    }
  });

  it("carry the same title and description in the head", () => {
    for (const html of [page, preview]) {
      expect(titleOf(html)).toBe(TITLE);
      expect(descriptionOf(html)).toBe(DESCRIPTION);
    }
  });

  it("read that copy rather than restating it", () => {
    // Behaviour above would still pass with the words pasted into both
    // files — until someone edited one of them. This is what keeps the shared
    // module the place a sentence is written.
    //
    // Every sentence is banned from both renderers, not just the two the page
    // opens with: a pasted-back point detail drifts exactly as quietly as a
    // pasted-back lead. `HEADING` is the one string that cannot be checked
    // this way — it is "mamen", which both files may legitimately contain in
    // a URL, an import or a comment — so it is held by the behaviour above.
    const sentences = [TITLE, DESCRIPTION, LEAD, OPEN_APP, SOURCE, ...POINTS.map((p) => p.detail)];

    for (const file of ["../page.ts", "./routes.tsx"]) {
      const text = source(file);
      expect(text).toMatch(/from "\.\.?\/copy"/);
      for (const sentence of sentences) {
        expect(text).not.toContain(sentence);
      }
    }
  });
});
