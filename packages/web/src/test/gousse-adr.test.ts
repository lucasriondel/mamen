import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ADR 0002 is superseded, not rewritten (issue #98).
 *
 * The gousse migration (#92, #93, #95, #96, #97) replaced a private npm
 * dependency with a shadcn registry that copies source into the repo. Each
 * slice landed before there was a record to hold the new state, so each one
 * amended ADR 0002 in place — leaving a decision record that was half the
 * decision as taken and half a description of the tree that replaced it.
 *
 * The repo's convention (root `docs/adr/0001` → `0003`) is a status header on
 * the old record and a `Supersedes` line on the new one; the superseded body is
 * left alone, because a record edited until it agrees with today is no longer a
 * record of anything. So ADR 0002 goes back to the bridge decision as taken and
 * ADR 0003 states what is true now.
 *
 * Asserted as text because prose is the artefact: nothing here renders, and the
 * failure mode is a later slice quietly amending the superseded record again
 * rather than writing its own. Paths are cwd-relative — vitest runs from the
 * package root, so the repo root is `../../`.
 */

const read = (path: string) => readFileSync(path, "utf8");

const ADR_DIR = "docs/adr";
const SUPERSEDED = `${ADR_DIR}/0002-gousse-ui-tailwind-v4-theme-bridge.md`;
const CURRENT = `${ADR_DIR}/0003-gousse-is-vendored-from-a-shadcn-registry.md`;

const superseded = read(SUPERSEDED);
const current = read(CURRENT);

/**
 * Prose wraps at 80 columns and carries emphasis markers; a phrase does not.
 * Assertions about *what a sentence says* read this, so re-wrapping a paragraph
 * — or bolding a clause — is never a failure.
 */
const flatten = (source: string) => source.replace(/[*`]/g, "").replace(/\s+/g, " ");

const currentProse = flatten(current);

/** The body of the superseded record — everything below its status header. */
const supersededBody = superseded
  .split("\n")
  .filter((line) => !line.startsWith(">"))
  .join("\n");

const PACKAGE = "@lucasriondel/gousse-ui";
const TOKEN = "NODE_AUTH_TOKEN";

/** Build output, dependency trees and agent scratch — none of it is our prose. */
const PRUNED = new Set([
  ".claude",
  ".cursor",
  ".git",
  ".sandcastle",
  ".turbo",
  "coverage",
  "dist",
  "graphify-out",
  "logs",
  "node_modules",
]);

/** This file — it names what it forbids, so it cannot scan itself. */
const SELF = "packages/web/src/test/gousse-adr.test.ts";

/**
 * The one document allowed to describe the npm era: the record of the decision
 * that era *was*. Its status header says so, which is asserted below.
 */
const HISTORICAL = `packages/web/${SUPERSEDED}`;

/** Every markdown file in the repo, as `[repo-relative path, contents]`. */
function repoDocs(dir = "../..", prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];

  for (const entry of readdirSync(dir)) {
    if (PRUNED.has(entry)) continue;

    const path = `${dir}/${entry}`;
    const relative = prefix ? `${prefix}/${entry}` : entry;

    if (statSync(path).isDirectory()) {
      out.push(...repoDocs(path, relative));
      continue;
    }
    if (!relative.endsWith(".md") || relative === SELF) continue;

    out.push([relative, read(path)]);
  }

  return out;
}

describe("the superseded record", () => {
  it("carries the repo's status header, pointing at ADR 0003", () => {
    expect(superseded).toContain(
      "> **Status: superseded by [ADR 0003](./0003-gousse-is-vendored-from-a-shadcn-registry.md).**",
    );
    expect(existsSync(CURRENT)).toBe(true);
  });

  it("keeps the bridge decision as taken, not an account of what replaced it", () => {
    expect(flatten(supersededBody)).toContain("ships a Tailwind v3 artifact");

    // The migration's own vocabulary — none of it existed when the bridge was
    // decided. `shadcn` is deliberately absent from this list: the gap-fill
    // components are shadcn's and predate the registry.
    expect(supersededBody).not.toContain("shadcn registry");
    expect(supersededBody).not.toContain("vendored");
    expect(supersededBody).not.toContain("rounded-full");
    expect(supersededBody).not.toMatch(/#9\d\b/);
  });
});

describe("the current record", () => {
  it("declares what it supersedes", () => {
    expect(current).toContain("[ADR 0002](./0002-gousse-ui-tailwind-v4-theme-bridge.md)");
    expect(current).toMatch(/\*\*Supersedes\*\*/);
  });

  it("describes registry vendoring — source copied in at install time", () => {
    expect(currentProse).toContain("shadcn add @gousse/");
    expect(currentProse).toContain("components.json");
    expect(currentProse).toContain("src/styles/gousse/");
    expect(currentProse).toContain("src/components/ui/");
    expect(currentProse).toMatch(/copied at install time/i);
  });

  it("states the trade the registry makes, both sides of it", () => {
    expect(currentProse).toMatch(/no version to track/i);
    expect(currentProse).toMatch(/upstream fix\w* will never reach/i);
    expect(currentProse).toMatch(/ownership and editability/i);
  });

  it("keeps the token contract: channel triples, wrapped in raw CSS", () => {
    expect(currentProse).toContain("rgb channel triples");
    expect(currentProse).toContain("rgb(var(--gousse-bg))");
    expect(currentProse).toContain("bare channels");
  });

  it("keeps the seam between the two primitive systems", () => {
    expect(currentProse).toContain("Base UI");
    expect(currentProse).toContain("Radix");
    expect(currentProse).toMatch(/seam is the token layer/i);
  });

  it("keeps the shape contract and its inset consequence", () => {
    expect(current).toContain("`rounded-full`");
    expect(current).toContain("`rounded-2xl`");
    expect(current).toContain("`rounded-xl`");
    expect(current).toContain("FIELD_PILL");
    expect(current).toContain("px-4");
  });

  it("points at the tests that enforce each contract", () => {
    for (const test of [
      "src/styles/gousse-vendoring.test.ts",
      "src/components/ui/gousse-primitives.test.ts",
      "src/lib/shape-contract.test.ts",
      "src/test/gousse-package-removed.test.ts",
    ]) {
      expect(current).toContain(test);
    }
  });
});

describe("every other document", () => {
  it("describes gousse as a private npm package nowhere in the repo", () => {
    const offenders = repoDocs()
      .filter(([path]) => path !== HISTORICAL)
      .filter(([, body]) => body.includes(PACKAGE) || body.includes(TOKEN))
      .map(([path]) => path);

    expect(offenders).toStrictEqual([]);
  });
});
