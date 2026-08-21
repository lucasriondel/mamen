import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The **trend bucket** expression, held where the recap's other shared SQL
 * fragments are (issue #173).
 *
 * The two trend queries — the points series and the by-category composition —
 * bucket rows by the same `substr` over the ISO `date` TEXT, switching one
 * prefix length on the granularity. They each declared their own byte-for-byte
 * identical copy inside their `execute` closure, 26 lines apart, which is one
 * copy too many for an expression whose whole job is to make the two agree on
 * what a bucket *is*: a cell of the composition sums into the point above it
 * only while both read the same key.
 *
 * So the fragment is declared once, beside `spentCents` — the named money
 * fragment the recap queries already share the same way — and this file is what
 * keeps it that way. Read as source, not behaviour: two identical copies pass
 * every recap test there is, which is exactly why the duplication survived.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const SOURCE = readFileSync("src/transactions/repository.ts", "utf8");

/** The bucket derivation itself, whichever name it is bound to. */
const BUCKET_EXPRESSION = /substr\(t\.date, 1, \$\{sql\.literal\(/g;

/** Prose as one line, comment markers and hard wraps gone. */
const prose = (text: string) =>
  text
    .replace(/^\s*\/{2,}\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();

/** The body of `execute:` inside a named query declaration, to its closing `});`. */
const executeBody = (name: string): string => {
  const at = SOURCE.indexOf(`const ${name} = SqlSchema.`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  const rest = SOURCE.slice(at);
  const end = rest.indexOf("\n    });");
  expect(end, `${name} has no closing brace`).toBeGreaterThan(-1);
  const body = rest.slice(0, end);
  return body.slice(body.indexOf("execute:"));
};

/** The 1-based line a snippet is declared on. */
const lineOf = (declaration: string): number => {
  const at = SOURCE.indexOf(declaration);
  expect(at, `${declaration} not found`).toBeGreaterThan(-1);
  return SOURCE.slice(0, at).split("\n").length;
};

/** The comment block immediately above a declaration, as prose. */
const commentAbove = (declaration: string): string => {
  const at = SOURCE.indexOf(declaration);
  expect(at, `${declaration} not found`).toBeGreaterThan(-1);
  const before = SOURCE.slice(0, at);
  const lines = before.split("\n");
  const comment: string[] = [];
  for (let i = lines.length - 2; i >= 0 && lines[i]?.trim().startsWith("//"); i -= 1)
    comment.unshift(lines[i] as string);
  return prose(comment.join("\n"));
};

const TREND_QUERIES = ["recapTrendQuery", "recapTrendByCategoryQuery"] as const;

describe("the trend bucket fragment (issue #173)", () => {
  it("derives the bucket in exactly one place", () => {
    expect(SOURCE.match(BUCKET_EXPRESSION)).toHaveLength(1);
  });

  it("declares it beside the money fragments the recap queries already share", () => {
    // In the shared-fragment block rather than in either closure: below
    // `spentCents` and above the first query that reads any of them. Stated as
    // position rather than a line distance since issue #167 put two more money
    // fragments between the two declarations.
    expect(lineOf("const trendBucket =")).toBeGreaterThan(lineOf("const spentCents ="));
    expect(lineOf("const trendBucket =")).toBeLessThan(lineOf("const recapByIssuerQuery ="));
    for (const query of TREND_QUERIES)
      expect(lineOf("const trendBucket =")).toBeLessThan(lineOf(`const ${query} =`));
  });

  it.each(TREND_QUERIES)("has %s read the shared fragment and declare no copy", (query) => {
    const body = executeBody(query);
    expect(body).toContain("trendBucket(f.granularity)");
    expect(body).not.toContain("substr(t.date");
  });

  it("keeps the note on why the composition groups by the category expression", () => {
    // A real SQLite hazard the code avoids: a bare `GROUP BY categoryId`
    // resolves to the stored column, splitting one derived category in two.
    const comment = commentAbove("const recapTrendByCategoryQuery =");
    expect(comment).toContain("not by the `categoryId` alias above it");
    expect(comment).toContain("which is the STORED category");
  });
});
