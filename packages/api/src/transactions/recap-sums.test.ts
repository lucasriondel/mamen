import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The recap's **money sums**, each named once (issue #167).
 *
 * Three recap queries — the transfer line, the excluded line and the trend
 * points — hand-wrote the same sign-filtered debit sum inside their aggregate,
 * and the trend hand-wrote the credit half beside it. That sum is *not* the
 * `spentCents` those queries' neighbours share: `spentCents` is a bare
 * `SUM(ROUND(-t.amount * 100))`, correct only because `spendWhere` has already
 * held the set to debits, whereas these three run under a WHERE with no sign
 * clause at all and so must filter inside the aggregate. Two forms of one
 * figure, telling nothing apart by their shape — which is exactly how a copy
 * ends up under the wrong WHERE and reports a refund as spending.
 *
 * So each form is declared once, beside the other, with its precondition
 * written down; this file keeps it that way. Read as source, not behaviour —
 * like `trend-bucket.test.ts` (issue #173), whose duplication every recap test
 * there is passed happily.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const SOURCE = readFileSync("src/transactions/repository.ts", "utf8");

/** The self-filtering debit magnitude, whichever name it is bound to. */
const DEBIT_SUM = /SUM\(CASE WHEN t\.amount < 0 THEN ROUND\(-t\.amount \* 100\) ELSE 0 END\)/g;

/** Its credit counterpart. */
const CREDIT_SUM = /SUM\(CASE WHEN t\.amount > 0 THEN ROUND\(t\.amount \* 100\) ELSE 0 END\)/g;

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

/** Every query that sums debit magnitudes under a sign-free WHERE. */
const DEBIT_READERS = ["recapTransfersQuery", "recapExcludedQuery", "recapTrendQuery"] as const;

describe("the recap money fragments (issue #167)", () => {
  it("writes each sign-filtered sum exactly once", () => {
    expect(SOURCE.match(DEBIT_SUM)).toHaveLength(1);
    expect(SOURCE.match(CREDIT_SUM)).toHaveLength(1);
  });

  it("declares both beside the WHERE-filtered sum they are not", () => {
    // In the shared-fragment block rather than in any closure: below
    // `spentCents`, so the three forms are read together, and above every
    // reader.
    for (const fragment of ["const debitCents =", "const creditCents ="]) {
      expect(lineOf(fragment)).toBeGreaterThan(lineOf("const spentCents ="));
      expect(lineOf(fragment)).toBeLessThan(lineOf("const recapByIssuerQuery ="));
      for (const query of DEBIT_READERS)
        expect(lineOf(fragment)).toBeLessThan(lineOf(`const ${query} =`));
    }
  });

  it.each(DEBIT_READERS)("has %s read the shared debit sum and declare no copy", (query) => {
    const body = executeBody(query);
    expect(body).toContain("${debitCents}");
    expect(body).not.toContain("CASE WHEN t.amount < 0");
  });

  it("has the trend read the shared credit sum for its earnings half", () => {
    const body = executeBody("recapTrendQuery");
    expect(body).toContain("${creditCents}");
    expect(body).not.toContain("CASE WHEN t.amount > 0");
  });

  it.each(["spentCents", "debitCents", "creditCents"])(
    "says of %s whether it leans on the WHERE clause for its sign",
    (fragment) => {
      // The one thing that tells the two forms apart, and the only thing
      // stopping one being pasted where the other belongs.
      expect(commentAbove(`const ${fragment} =`)).toMatch(/WHERE/);
    },
  );

  it("leaves the period picker's own month prefix alone", () => {
    // It has no granularity, and routing it through `trendBucket` would imply
    // one (issue #173 left it for the same reason).
    const body = executeBody("recapPeriodsQuery");
    expect(body).toContain("substr(t.date, 1, 7)");
    expect(body).not.toContain("trendBucket");
  });

  it("keeps the SQLite GROUP BY warning, minus its stale naming claim", () => {
    // The hazard is real and cost a bug: a bare `GROUP BY categoryId` resolves
    // to the stored column, splitting one derived category in two. What goes is
    // only the trailing clause about `bucket` being a name local to that
    // closure — untrue the moment the builder is shared.
    const comment = commentAbove("const recapTrendByCategoryQuery =");
    expect(comment).toContain("not by the `categoryId` alias above it");
    expect(comment).toContain("which is the STORED category");
    expect(comment).toContain("The by-category breakdown groups by the same expression");
    expect(comment).not.toContain("safe to name");
  });
});
