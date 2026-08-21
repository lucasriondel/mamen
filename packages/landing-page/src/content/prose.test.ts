import { APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";
import { describe, expect, it } from "vitest";
import { ACTIONS, CONTRIBUTING, HERO, INSTALL, SCREENSHOTS, SITE } from ".";

/**
 * The rules every sentence in `src/content/` obeys (issue #147).
 *
 * Nothing here is passed through a markdown renderer — the modules are read by
 * two renderers that write markup, and neither parses prose. So an asterisk
 * meant as emphasis reaches the reader as an asterisk, and a backticked
 * command reaches them with its backticks. That is a class of bug a reviewer
 * catches only by reading the built page, which is why it is a test instead.
 *
 * The walk below is generic on purpose: a field added to a content type is
 * covered the day it is added, without anyone remembering to list it here.
 */

/**
 * Fields that are not prose: identifiers, URLs and the lines a reader types.
 *
 * `name` is a screenshot's key into the generated module (issue #149) — the
 * capture's file name for the surface, not a word anybody reads.
 */
const NOT_PROSE = new Set(["url", "href", "commands", "variable", "version", "kind", "name"]);

/** Every prose string in the content, wherever it sits in the structure. */
const proseOf = (value: unknown, key = ""): readonly string[] => {
  if (typeof value === "string") return NOT_PROSE.has(key) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((item) => proseOf(item, key));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([name, item]) => proseOf(item, name));
  }
  return [];
};

const PROSE = proseOf({ SITE, HERO, SCREENSHOTS, INSTALL, CONTRIBUTING, ACTIONS });

/** Every line a reader is told to type, across the guide. */
const COMMANDS = INSTALL.steps.flatMap((step) => step.commands);

const MARKDOWN: readonly (readonly [string, RegExp])[] = [
  ["a code span", /`/],
  ["emphasis", /[*_]/],
  ["a link", /\[|\]\(/],
  ["a heading", /^#{1,6}\s/],
  ["a list marker", /^\s*(?:[-+]\s|\d+\.\s)/],
  ["a tag or an autolink", /<[^>]+>/],
];

describe("the content's prose", () => {
  it("is not empty, so the walk below is asserting on something", () => {
    // A rename that broke `proseOf` would otherwise turn every rule here
    // into a loop over nothing, and the suite would go green on no content.
    expect(PROSE.length).toBeGreaterThan(20);
    expect(PROSE).toContain(HERO.lead);
    expect(PROSE).toContain(INSTALL.steps[0]?.detail);
  });

  it("carries no markdown syntax", () => {
    for (const sentence of PROSE) {
      for (const [syntax, pattern] of MARKDOWN) {
        expect(sentence, `${syntax} in: ${sentence}`).not.toMatch(pattern);
      }
    }
  });

  it("states no command inside a sentence", () => {
    // A command belongs to the step that runs it, where it renders as a block
    // a reader can copy. Inline, it is a sentence they have to retype and a
    // second place it can drift from the README.
    for (const sentence of PROSE) {
      for (const command of COMMANDS) {
        expect(sentence, `command in: ${sentence}`).not.toContain(command);
      }
    }
  });

  it("does not oversell a tool one person runs for themselves", () => {
    const all = PROSE.join(" ");
    expect(all).not.toMatch(/sign up|sign-up|free trial|pricing|get started free|join us/i);
    expect(all).toMatch(/self-hosted/i);
    expect(all).toMatch(/single-user/i);
  });

  it("describes no OAuth scope, no third-party processor and no vendor's data handling", () => {
    // The shape came from a sibling project whose content modules document a
    // Google OAuth consent screen, its data sub-processors and an AI vendor's
    // retention policy. This app has no OAuth, reaches no third party for
    // your data and hosts nothing, so carrying those sections over would
    // describe a product that does not exist.
    const all = [...PROSE, ...COMMANDS, ...ACTIONS.map((a) => a.href)].join(" ");
    for (const absent of [
      /oauth/i,
      /\bscopes?\b/i,
      /consent screen/i,
      /sub-?processor/i,
      /third[- ]party/i,
      /data (?:processing|retention|handling)/i,
      /privacy policy/i,
      /\bgdpr\b/i,
      /\banthropic\b/i,
      /\bopenai\b/i,
      /\bgoogle\b/i,
    ]) {
      expect(all).not.toMatch(absent);
    }
  });
});

describe("the call to action", () => {
  it("offers the app and the source, and nothing to sign up to", () => {
    expect(ACTIONS.map((action) => action.kind)).toStrictEqual(["primary", "secondary"]);
    expect(ACTIONS.map((action) => action.href)).toContain(SITE.repositoryUrl);
  });

  it("reads the app's prefix from the constant rather than restating it", () => {
    // The one fact this package shares with the app. Written out by hand it
    // becomes a link that survives a rename by pointing at nothing.
    const primary = ACTIONS.find((action) => action.kind === "primary");
    expect(primary?.href).toBe(APP_BASE_PATH_SLASH);
  });
});
