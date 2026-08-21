import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The cache-invalidation rule for a **Matching Rule**'s **Owned count**, as
 * `packages/web/CONTEXT.md` states it (issue #170).
 *
 * The rule used to read "any mutation that moves rows must invalidate
 * `ruleKeys.all`", with the triggering cases enumerated after it. The
 * enumeration was right; the sentence above it was a superset. "Moves" taken in
 * its display/aggregation sense — transfer linking nets rows out of recap
 * spend, recap exclusion hides them, a category override relocates them — makes
 * the four hooks that correctly omit `ruleKeys.all` look like staleness bugs,
 * and two separate reviews reported them as exactly that.
 *
 * So the rule is the field list now (issue #166 put the same six on the API
 * side), and the inverse is written down rather than left to be re-derived. The
 * assertions below hold the doc to both halves, and hold the hooks to the doc:
 * prose is the artefact here, and the failure mode is prose drifting off the
 * code it describes.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const CONTEXT = readFileSync("CONTEXT.md", "utf8");
const API_CONTEXT = readFileSync("../api/CONTEXT.md", "utf8");

/**
 * The six inputs, in the exact words both packages must use — the list
 * `packages/api/CONTEXT.md` and the matcher's `derive` already carry, so one
 * phrasing spans the whole repo.
 */
const INPUTS = [
  "row existence",
  "`manualIssuer`",
  "`rawIssuerString`",
  "`amount`",
  "`accountId`",
  "the rule set",
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

/** Prose as one line, with the 80-column hard wraps gone. */
const prose = (text: string) => text.replace(/\s+/g, " ").trim();

/** One `**Term**:` glossary entry, up to the next one. */
const glossaryEntry = (source: string, term: string): string => {
  const at = source.indexOf(`**${term}**:`);
  expect(at, `${term} not in the glossary`).toBeGreaterThan(-1);
  const rest = source.slice(at + term.length);
  const next = rest.indexOf("\n\n**");
  return prose(next === -1 ? rest : rest.slice(0, next));
};

const hook = (path: string) => readFileSync(`src/features/${path}`, "utf8");

const invalidatesRules = (source: string) => source.includes("ruleKeys.all");

/** One `const <name> = useMutation({ ... });` block, body included. */
const mutationBlock = (source: string, name: string): string => {
  const at = source.indexOf(`const ${name} = useMutation({`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  const rest = source.slice(at);
  const end = rest.indexOf("\n  });");
  return end === -1 ? rest : rest.slice(0, end);
};

const entry = glossaryEntry(CONTEXT, "Matching Rule");

describe("the owned-count invalidation rule", () => {
  it("names the six inputs instead of leaning on 'moves rows'", () => {
    for (const input of INPUTS) {
      expect(entry).toContain(input);
    }
    // The old rule sentence, gone as a rule. The phrase may still appear as
    // the thing being warned off — that is what the `_Avoid_` line is for.
    expect(entry).not.toContain("moves rows must invalidate");
  });

  it("still says what the count is for: invalidate `ruleKeys.all`, not just transactions", () => {
    expect(entry).toContain("`ruleKeys.all`");
    expect(entry).toContain("`transactionKeys.all`");
  });

  it("keeps the enumeration of triggering cases, bundle rationale included", () => {
    for (const trigger of [
      "an assignment",
      "a removed manual pick",
      "an import commit",
      "**bundle** mutation",
    ]) {
      expect(entry).toContain(trigger);
    }
    // Bundles are in the list because the parent row is an ordinary row whose
    // `rawIssuerString` is the user's label — the string the matcher reads.
    expect(entry).toContain("the user's label as its `rawIssuerString`");
    expect(entry).toContain("#78");
  });

  it("states the inverse, with the concrete non-triggering fields", () => {
    expect(entry).toContain("cannot change an Owned count");
    for (const field of NON_INPUTS) {
      expect(entry).toContain(field);
    }
    // An issuer's own recap flag is the fourth counter-example and the one that
    // isn't a transaction column at all.
    expect(entry).toMatch(/issuer'?s? own .*recap/i);
  });

  it("says the omitting hooks are correct, by name", () => {
    for (const name of [
      "useTransfer",
      "useCategoryOverride",
      "useRecapExclusion",
      "setExcludedFromRecap",
    ]) {
      expect(entry).toContain(`\`${name}\``);
    }
    expect(entry).toContain("correctly");
  });

  it("warns off the wording it replaces", () => {
    expect(entry).toContain('_Avoid_: "moves rows"');
  });
});

describe("the API-side section it must agree with", () => {
  const apiEntry = glossaryEntry(API_CONTEXT, "Owned-count input set");

  it("carries the same six inputs and the same counter-examples", () => {
    for (const phrase of [...INPUTS, ...NON_INPUTS]) {
      expect(apiEntry).toContain(phrase);
      expect(entry).toContain(phrase);
    }
  });

  it("carries the same inverse sentence, word for word", () => {
    const inverse = "a write touching none of the six cannot change an Owned count";
    expect(apiEntry).toContain(inverse);
    expect(entry).toContain(inverse);
  });

  it("no longer forwards to issue #170 for a web half that has landed", () => {
    expect(apiEntry).not.toContain("issue #170 restates");
  });
});

describe("the hooks the rule describes", () => {
  it("invalidates `ruleKeys.all` wherever one of the six is written", () => {
    for (const path of [
      "transactions/use-assign-issuer.ts",
      "transactions/use-bulk-delete.ts",
      "transactions/use-bundle.ts",
      "import/use-import-commit.ts",
    ]) {
      expect(invalidatesRules(hook(path)), path).toBe(true);
    }
  });

  it("omits it wherever none of the six is written", () => {
    for (const path of [
      "transactions/use-transfer.ts",
      "transactions/use-category-override.ts",
      "transactions/use-recap-exclusion.ts",
    ]) {
      expect(invalidatesRules(hook(path)), path).toBe(false);
    }
    // The issuer recap lever is a mutation inside a hook that does plenty else,
    // so it is checked as the block it is rather than as the whole file.
    expect(
      invalidatesRules(
        mutationBlock(hook("issuers/use-issuer-mutations.ts"), "setExcludedFromRecap"),
      ),
    ).toBe(false);
  });
});
