import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The **Owned count**'s input set, held in the two places an api-side reader
 * looks for it: the derivation itself and this package's glossary (issue #166).
 *
 * The count is derived on every read, from six things and nothing else. Read
 * loosely — as the cache-invalidation rule on the web side once put it, "any
 * mutation that moves rows" — that invites one specific false positive: the
 * belief that a write changing how a transaction is *displayed or aggregated*
 * (transfer linking, category override, recap exclusion) also changes what a
 * rule owns. It does not, and two separate reviews have now derived and refuted
 * exactly that. The assertions below are what keeps the refutation written down
 * where the derivation is, instead of being re-derived a third time.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const MATCHER = readFileSync("src/matching/issuer-matcher.ts", "utf8");
const CONTEXT = readFileSync("CONTEXT.md", "utf8");

/**
 * The seven inputs, in the exact words both documents must use — the same list
 * `packages/web/CONTEXT.md` carries, so one phrasing spans both packages.
 *
 * `bundleId` is the odd one out and is listed anyway (issue #199): it decides
 * not *who wins* a row but whether the row is **counted** at all, a **bundle
 * member** being the one thing this app never counts. A reader checking a
 * mutation against the list needs it there — bundling a row a rule owns lowers
 * that rule's count without touching a rule or an issuer.
 */
const INPUTS = [
  "row existence",
  "`manualIssuer`",
  "`rawIssuerString`",
  "`amount`",
  "`accountId`",
  "the rule set",
  "`bundleId`",
] as const;

/**
 * The counter-examples: fields a write can touch all day without moving an
 * Owned count. Naming them is the point of the ticket — the inverse is what a
 * reader checks a mutation against.
 */
const NON_INPUTS = [
  "`transferGroupId`",
  "`categoryId`",
  "`manualCategory`",
  "`excludedFromRecap`",
  "`manualExcluded`",
] as const;

/**
 * Prose as one line, with comment markers and hard wraps gone — both documents
 * wrap at 80 columns, and a sentence is a sentence whichever column it broke at.
 */
const prose = (text: string) => text.replace(/\s+/g, " ").trim();

/** The doc comment immediately above a declaration, as prose. */
const docCommentAbove = (source: string, declaration: string): string => {
  const at = source.indexOf(declaration);
  expect(at, `${declaration} not found`).toBeGreaterThan(-1);
  const before = source.slice(0, at);
  return prose(before.slice(before.lastIndexOf("/**")).replace(/^\s*\*+ ?/gm, ""));
};

/** One `**Term**:` glossary entry, up to the next one. */
const glossaryEntry = (source: string, term: string): string => {
  const at = source.indexOf(`**${term}**:`);
  expect(at, `${term} not in the glossary`).toBeGreaterThan(-1);
  const rest = source.slice(at + term.length);
  const next = rest.indexOf("\n\n**");
  return prose(next === -1 ? rest : rest.slice(0, next));
};

describe("the Owned count's input set", () => {
  const deriveDoc = docCommentAbove(MATCHER, "export const derive = (");

  it("is named at the derivation site, all seven of it", () => {
    for (const input of INPUTS) {
      expect(deriveDoc).toContain(input);
    }
  });

  it("says what `bundleId` does there — a bundle member is not counted", () => {
    expect(deriveDoc).toMatch(/bundle member/i);
    expect(deriveDoc).toContain("#199");
  });

  it("states the inverse: a write touching none of them moves nothing", () => {
    expect(deriveDoc).toContain("cannot change an Owned count");
  });

  it("names the concrete non-triggering fields as counter-examples", () => {
    for (const field of NON_INPUTS) {
      expect(deriveDoc).toContain(field);
    }
    // An issuer's own recap flag is the fourth counter-example and the one
    // that isn't a transaction column at all.
    expect(deriveDoc).toMatch(/issuer'?s? .*recap/i);
  });

  it("is reachable from `MatchRow`, which carries only the row half of it", () => {
    expect(docCommentAbove(MATCHER, "type MatchRow =")).toContain("input set");
  });

  it("dates its cross-package claim by naming the ticket that landed the web half", () => {
    // Issue #170 replaced "any mutation that moves rows" in
    // `packages/web/CONTEXT.md` with this list, so the cross-package claim is
    // true in the present tense now. The ticket stays named: it is what a
    // reader follows to see which wording was replaced, and why.
    expect(deriveDoc).toContain("#170");
  });
});

describe("the package glossary", () => {
  const entry = glossaryEntry(CONTEXT, "Owned-count input set");

  it("carries the same seven inputs, in the same words", () => {
    for (const input of INPUTS) {
      expect(entry).toContain(input);
    }
  });

  it("carries the same counter-examples and the same inverse", () => {
    for (const field of NON_INPUTS) {
      expect(entry).toContain(field);
    }
    expect(entry).toMatch(/issuer'?s? .*recap/i);
    expect(entry).toContain("cannot change an Owned count");
  });

  it("points at the derivation the rule is about", () => {
    expect(entry).toContain("issuer-matcher.ts");
  });

  it("dates its cross-package claim the same way the derivation does", () => {
    expect(entry).toContain("#170");
  });
});
