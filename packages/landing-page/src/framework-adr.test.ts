import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The zero-dependency decision is superseded, not quietly edited (issue #148).
 *
 * This package was built with no framework on purpose, and that was a decision
 * rather than an accident of scope: the landing image was to carry no
 * dependency on the app (issue #113). The React port reverses half of it. A
 * reversal with no written trace is the thing that makes a codebase confusing
 * later — the next reader finds a rule and a tree that contradict each other,
 * with no way to tell which one is current — so the reversal is recorded the
 * way this repo records reversals: a status header on the old record, a
 * `Supersedes` line on the new one, and the superseded body left alone.
 *
 * Asserted as text because prose is the artefact: nothing here renders, and the
 * failure mode is a later slice amending the superseded record until it agrees
 * with today, at which point it is a record of nothing. The same pattern, and
 * most of this file's shape, comes from `packages/web/src/test/gousse-adr.test.ts`.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const ADR_DIR = "docs/adr";
const SUPERSEDED = `${ADR_DIR}/0001-the-landing-page-takes-no-framework.md`;
const CURRENT = `${ADR_DIR}/0002-react-renders-the-landing-page-at-build-time.md`;

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

/** Build output, dependency trees and agent scratch — none of it is our prose. */
const PRUNED = new Set([
  ".claude",
  ".cursor",
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "graphify-out",
  "logs",
  "node_modules",
  "worktrees",
]);

/** This file — it names what it forbids, so it cannot scan itself. */
const SELF = "packages/landing-page/src/framework-adr.test.ts";

/** The one document allowed to describe the package as framework-free: the
 *  record of the decision it once was. Its status header says so. */
const HISTORICAL = `packages/landing-page/${SUPERSEDED}`;

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
  it("carries the repo's status header, pointing at ADR 0002", () => {
    expect(superseded).toContain(
      `> **Status: superseded by [ADR 0002](./${CURRENT.slice(ADR_DIR.length + 1)}).**`,
    );
    expect(existsSync(CURRENT)).toBe(true);
  });

  it("keeps the decision as taken, not an account of what replaced it", () => {
    expect(flatten(supersededBody)).toContain("renders a finished HTML document as a string");

    // The port's own vocabulary — none of it existed when this was decided.
    for (const word of ["React", "TanStack", "renderToStaticMarkup", "#145", "#148"]) {
      expect(supersededBody, `the superseded body reaches for ${word}`).not.toContain(word);
    }
  });

  it("says where the decision was actually written down before it had a record", () => {
    // It was never an ADR: it lived in an issue's acceptance criteria and in
    // the package's own prose. A reader who cannot get back to those has to
    // take this record's word for what was decided.
    expect(superseded).toContain("#113");
  });
});

describe("the current record", () => {
  it("declares what it supersedes", () => {
    expect(current).toContain(`[ADR 0001](./${SUPERSEDED.slice(ADR_DIR.length + 1)})`);
    expect(current).toMatch(/\*\*Supersedes\*\*/);
  });

  it("states what changed: the renderer, and what it costs", () => {
    expect(currentProse).toMatch(/renderToStaticMarkup/);
    expect(currentProse).toMatch(/TanStack/);
    expect(currentProse).toMatch(/expand.contract/i);
  });

  it("states what did not change, which is the property worth keeping", () => {
    // The half of ADR 0001 that survives the reversal, and the reason the
    // reversal was affordable at all.
    expect(currentProse).toMatch(/devDependenc/);
    expect(currentProse).toMatch(/no script tag|carries no JavaScript|no JavaScript at all/i);
    expect(currentProse).toMatch(/build time/);
  });

  it("says why, rather than only what", () => {
    expect(currentProse).toMatch(/sibling project|gousse|miel/i);
    expect(currentProse).toMatch(/escap/i);
  });

  it("points at the tests that hold each half of it", () => {
    for (const test of [
      "src/page.test.ts",
      "src/build.test.ts",
      "src/copy.test.ts",
      "src/packaging.test.ts",
    ]) {
      expect(current).toContain(test);
    }
  });
});

describe("the package's references to both records", () => {
  it("name records that exist", () => {
    // The glossary, the renderer, the Dockerfile and the two records point at
    // each other by filename. A path that resolves to nothing is worse than no
    // citation: it reads as "the reasoning is written down" to a reader who
    // never checks, and none of these are markdown links a tool would follow.
    const files = [
      "CONTEXT.md",
      "Dockerfile",
      SUPERSEDED,
      CURRENT,
      ...readdirSync("src", { recursive: true, encoding: "utf8" })
        .filter((entry) => /\.tsx?$/.test(entry))
        .map((entry) => `src/${entry}`),
    ];
    const cited = files.flatMap((file) =>
      [...read(file).matchAll(/(?:docs\/adr\/|\.\/)(\d{4}-[\w-]+\.md)/g)].map(
        (m) => m[1] as string,
      ),
    );

    expect(new Set(cited).size).toBeGreaterThan(1);
    for (const record of cited) {
      expect(existsSync(`${ADR_DIR}/${record}`), `cited: ${record}`).toBe(true);
    }
  });
});

describe("every other document", () => {
  it("calls this package framework-free nowhere in the repo", () => {
    // The claim is the thing that has to move, not just the code: "no
    // framework" in the README's package table is what a reader trusts over
    // the tree, and it is now false. Read line by line, because that claim is
    // a table cell — a document-wide search for the two phrases would match
    // any file that happened to mention both, several paragraphs apart.
    const offenders = repoDocs()
      .filter(([path]) => path !== HISTORICAL)
      .flatMap(([path, body]) =>
        body
          .split("\n")
          .filter((line) => /landing.page/i.test(line) && /no framework|framework.free/i.test(line))
          .map((line) => `${path}: ${line.trim()}`),
      );

    expect(offenders).toStrictEqual([]);
  });
});
