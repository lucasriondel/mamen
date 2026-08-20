import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTIONS, CONTRIBUTING, HERO, INSTALL, SCREENSHOTS, SITE } from "./content";
import { renderPage } from "./page";

/**
 * The renderer says the words `src/content/` holds, and none of its own
 * (issues #145, #147, #148).
 *
 * This suite was written to hold *two* renderers to one set of words while the
 * expand step ran: two forms of the same page, both reading the same modules,
 * compared on the text a reader sees. The contract step deleted the string one,
 * so the comparison between them went with it — but the rule it enforced did
 * not, and is the reason the swap was a swap rather than a rewrite. What is
 * left is that rule stated against the renderer that survived: the page is
 * whatever the content modules say, and a sentence pasted into a package file
 * fails here.
 *
 * The reading is on **text**, not markup: React escapes an apostrophe to
 * `&#x27;`, and tags are not words. So the page is stripped to what a reader
 * sees, with runs of whitespace collapsed.
 *
 * The command blocks are read separately and *without* stripping tags: a step's
 * commands carry angle brackets (the encryption key's placeholder), and a
 * comparison that treated those as markup would compare a line with the
 * interesting half deleted.
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

/** The package's sources — this file sits in them. */
const SRC = fileURLToPath(new URL("./", import.meta.url));

const page = await renderPage();

/** Every sentence the content puts in the body, in no particular order. */
const SENTENCES = [
  HERO.lead,
  ...HERO.points.flatMap((point) => [point.term, point.detail]),
  SCREENSHOTS.heading,
  SCREENSHOTS.lead,
  ...SCREENSHOTS.shots.flatMap((shot) => [shot.title, shot.caption]),
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
  // The alt text never renders as text — it is an attribute, so the reading
  // above cannot see it — and it is the sentence most likely to be pasted
  // into a renderer, being the one that describes what the markup shows.
  ...SCREENSHOTS.shots.map((shot) => shot.alt),
  ...INSTALL.steps.flatMap((step) => step.commands),
].filter((sentence) => sentence.length > 20);

describe("the rendered page", () => {
  it("says the words `src/content/` holds, rather than its own", () => {
    for (const line of SENTENCES) {
      expect(text(page)).toContain(text(line));
    }
  });

  it("renders every install step's commands, in order", () => {
    expect(blocks(page)).toStrictEqual(INSTALL.steps.map((step) => step.commands.join("\n")));
  });

  it("carries the title and the description in the head", () => {
    expect(titleOf(page)).toBe(SITE.title);
    expect(descriptionOf(page)).toBe(SITE.description);
  });
});

describe("the page's words", () => {
  it("are written in `src/content/` and nowhere else in the package", () => {
    // Behaviour above would still pass with the words pasted into the
    // renderer — until someone edited one of the two copies. This is what
    // keeps the content module the place a sentence is written.
    //
    // The ban is on the package rather than on a list of renderers: what a
    // migration leaves behind is the module it migrated from, still holding
    // the old sentences, imported by nothing, and edited by the next person
    // who greps for a word on the page. A leftover, a helper, or a second
    // renderer, all fail here the day they hold a sentence.
    expect(SENTENCES_RESTATED.length).toBeGreaterThan(15);
    expect(source("./page.tsx")).toMatch(/from "\.\/content"/);

    const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
      (entry) => /\.tsx?$/.test(entry) && !entry.startsWith("content/"),
    );
    expect(files.length).toBeGreaterThan(5);

    for (const file of files) {
      const contents = source(`./${file}`);
      for (const sentence of SENTENCES_RESTATED) {
        // Tests read the content to assert on it; what they may not do is
        // spell a sentence out, which is the same drift in a second file.
        expect(contents, `${file} restates: ${sentence}`).not.toContain(sentence);
      }
    }
  });
});
