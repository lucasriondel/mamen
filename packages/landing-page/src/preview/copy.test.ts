import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTIONS, CONTRIBUTING, HERO, INSTALL, SITE } from "../content";
import { renderPage } from "../page";
import { renderPreviewPage } from "./render";

/**
 * The two renderers, held to the same page (issue #145).
 *
 * Expand–contract only pays off if the contract step is a **swap**: the day
 * `/preview/` takes the root, a visitor should get the same words, and any
 * difference should have been a deliberate edit rather than a copy that drifted
 * while the two forms sat side by side. Both read `src/content/`, and this is
 * what proves it — a literal pasted back into either renderer fails here.
 *
 * The comparison is on **text**, not markup: React escapes an apostrophe to
 * `&#x27;` and the string renderer writes it through, and the tags themselves
 * are exactly what is allowed to differ. So both sides are stripped to the
 * words a reader sees, with runs of whitespace collapsed — the string page
 * wraps its copy across lines and the React one does not.
 *
 * The command blocks are compared separately and *without* stripping tags: a
 * step's commands carry angle brackets (the encryption key's placeholder), and
 * a comparison that treated those as markup would compare the two renderers on
 * a sentence with the interesting half deleted.
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

/** Each preformatted block, as the reader would copy it. */
const blocks = (html: string) =>
  [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((match) =>
    decode((match[1] as string).replace(/<\/?code[^>]*>/g, "")).trim(),
  );

const titleOf = (html: string) => decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");

const descriptionOf = (html: string) =>
  decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** The package's sources — this file sits one directory inside them. */
const SRC = fileURLToPath(new URL("../", import.meta.url));

const page = renderPage();
const preview = await renderPreviewPage();

/** Every sentence the content puts in the body, in no particular order. */
const SENTENCES = [
  HERO.lead,
  ...HERO.points.flatMap((point) => [point.term, point.detail]),
  INSTALL.heading,
  INSTALL.lead,
  ...INSTALL.prerequisites.map((prerequisite) => prerequisite.detail),
  ...INSTALL.steps.flatMap((step) => [step.title, step.detail]),
  ...INSTALL.servers.map((server) => server.serves),
  ...INSTALL.environment.map((variable) => variable.detail),
  CONTRIBUTING.heading,
  ...CONTRIBUTING.body,
  ...ACTIONS.map((action) => action.label),
];

/**
 * The sentences a file may not restate, which is the long ones.
 *
 * Short labels are exempt — "mamen", "web" and "API" are words a source file
 * may legitimately contain in a URL, an import or a comment — so they are held
 * by the rendered behaviour above instead.
 */
const SENTENCES_RESTATED = [
  ...SENTENCES,
  SITE.title,
  SITE.description,
  ...INSTALL.steps.flatMap((step) => step.commands),
].filter((sentence) => sentence.length > 20);

describe("the string page and the React page", () => {
  it("say the same words", () => {
    expect(text(preview)).toBe(text(page));
  });

  it("say the words `src/content/` holds, rather than their own", () => {
    for (const line of SENTENCES) {
      for (const html of [page, preview]) {
        expect(text(html)).toContain(text(line));
      }
    }
  });

  it("render every install step's commands, identically and in order", () => {
    const commands = INSTALL.steps.map((step) => step.commands.join("\n"));
    expect(blocks(page)).toStrictEqual(commands);
    expect(blocks(preview)).toStrictEqual(commands);
  });

  it("carry the same title and description in the head", () => {
    for (const html of [page, preview]) {
      expect(titleOf(html)).toBe(SITE.title);
      expect(descriptionOf(html)).toBe(SITE.description);
    }
  });

  it("read that copy rather than restating it", () => {
    // Behaviour above would still pass with the words pasted into both
    // files — until someone edited one of them. This is what keeps the shared
    // module the place a sentence is written.
    //
    // Every sentence is banned from both renderers, not just the two the page
    // opens with: a pasted-back point detail drifts exactly as quietly as a
    // pasted-back lead.
    expect(SENTENCES_RESTATED.length).toBeGreaterThan(15);

    for (const file of ["../page.ts", "./routes.tsx"]) {
      const renderer = source(file);
      expect(renderer).toMatch(/from "\.\.?\/content"/);
      for (const sentence of SENTENCES_RESTATED) {
        expect(renderer).not.toContain(sentence);
      }
    }
  });
});

describe("the page's words", () => {
  it("are written in `src/content/` and nowhere else in the package", () => {
    // The guard above names the two renderers, which was the whole package
    // when there was one place to write a sentence. Issue #147 moved the copy
    // into content modules, and what a migration leaves behind is the module
    // it migrated from: still holding the old sentences, imported by nothing,
    // and edited by the next person who greps for a word on the page.
    //
    // So the ban is on the package rather than on a list — a third renderer,
    // a helper, or a leftover, all fail here the day they hold a sentence.
    const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
      (entry) => /\.tsx?$/.test(entry) && !entry.startsWith("content/"),
    );
    expect(files.length).toBeGreaterThan(5);

    for (const file of files) {
      const contents = source(`../${file}`);
      for (const sentence of SENTENCES_RESTATED) {
        // Tests read the content to assert on it; what they may not do is
        // spell a sentence out, which is the same drift in a second file.
        expect(contents, `${file} restates: ${sentence}`).not.toContain(sentence);
      }
    }
  });
});
