import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **Raw source** is an archive, and nothing derives from it (ADR 0012 §2, and
 * the acceptance criterion of issue #187 that says it in those words: no matcher
 * reads it, no total counts it).
 *
 * That rule is a property of the *whole repo*, not of one module — the failure it
 * guards against is somebody reaching into the JSON bin for a value that turned
 * out to be useful, which is precisely how the archive would become a second,
 * competing source of truth. ADR 0012 answers that case differently: a value a
 * matcher needs is **promoted** to a column of its own, shape-checked at the
 * import edge, and the archive keeps the delivered form. `counterpartyIban` is
 * the one value that has earned it, and it is the control below — the scan that
 * must come up empty for `rawSource` finds it, which is what makes the empty
 * result mean something.
 *
 * Two assertions, because the rule has two halves:
 *
 * 1. **Who may name it at all.** Every source file whose *code* mentions
 *    `rawSource` is listed here with the role that entitles it. A new reader has
 *    to add itself, which is the friction: an archive nothing derives from is not
 *    a claim a reviewer can check by reading one diff.
 * 2. **What may be done with it in SQL.** The archive is selected and written;
 *    it is never filtered, grouped, joined, matched or summed on. A column that
 *    appears in a `WHERE`, a `WHEN`, a `GROUP BY` or an aggregate is a column
 *    something *derives from*, whatever the prose around it says.
 *
 * This lives under `src/test/` rather than beside a component because its subject
 * is the repo rather than a component — the same reason
 * `bank-statement-scrubbed.test.ts` does. Paths are cwd-relative (vitest runs
 * from the package root), so the repo root is `../../`.
 */

const ROOT = "../..";

/** The packages scanned: every one with source that could reach for the archive. */
const PACKAGES = ["api", "sdk", "shared", "web"] as const;

/**
 * Every non-test source file naming {@link COLUMN} in code, with the role that
 * entitles it. Ordered by path, which is the order the scan reports in.
 *
 * Prose-only mentions are not here and are not scanned for: two modules cite
 * `rawSource` as the *precedent* for holding JSON in a TEXT column and read
 * nothing. Citing a decision is not deriving from data.
 */
const ARCHIVE_SITES = [
  {
    path: "packages/api/src/ai-runner/prompt.ts",
    role: "where a PDF row's archive is asked for: the cells, as printed",
  },
  {
    path: "packages/api/src/ai-runner/tasks.ts",
    role: "the model's own row, whose archive is required of it",
  },
  {
    path: "packages/api/src/db/migrations/0030_add_transactions_raw_source.ts",
    role: "the migration that adds the column",
  },
  {
    path: "packages/api/src/demo/dataset.ts",
    role: "authored demo rows, which have no bank row behind them",
  },
  {
    path: "packages/api/src/import/extract.ts",
    role: "the fold from the model's answer: an empty archive becomes absent",
  },
  {
    path: "packages/api/src/transactions/bundle-writes.ts",
    role: "a bundle parent is the user's own row and carries none",
  },
  {
    path: "packages/api/src/transactions/repository.ts",
    role: "the row codec and the column lists — storage, in both directions",
  },
  {
    path: "packages/shared/src/contract/import.ts",
    role: "the field on an extracted row, which is how a PDF archive travels",
  },
  {
    path: "packages/shared/src/contract/transactions.ts",
    role: "the field itself",
  },
  {
    path: "packages/web/src/features/import/enrich-extracted.ts",
    role: "where a PDF row's archive joins the commit rail, carried not built",
  },
  {
    path: "packages/web/src/features/import/parsers/apply-format.ts",
    role: "where the archive is written: the whole row, every key kept",
  },
  {
    path: "packages/web/src/features/transactions/raw-source-section.tsx",
    role: "where it is rendered, labelled as the bank's own words",
  },
] as const;

const COLUMN = "rawSource";

/**
 * The value promoted *out of* the archive so a matcher could reach it (ADR 0012
 * §3). The control for the SQL scan: it is derived from, on purpose, so a scan
 * that finds nothing for it is broken rather than reassuring.
 */
const PROMOTED_COLUMN = "counterpartyIban";

/**
 * What deriving from a column looks like in this codebase's SQL. Upper-case and
 * word-bounded: these are SQL keywords in template literals, not the English
 * words that fill the comments around them.
 */
const DERIVATION =
  /\b(WHERE|WHEN|HAVING|GROUP BY|ORDER BY|JOIN|LIKE)\b|json_extract|\b(SUM|COUNT|AVG|MIN|MAX|TOTAL)\(/;

/** Directories a source scan has no business descending into. */
const PRUNED = new Set(["node_modules", "dist", "coverage", ".turbo"]);

/** Every non-test `.ts` / `.tsx` file under the scanned packages' `src/`. */
function sourceFiles(): string[] {
  const out: string[] = [];

  const walk = (dir: string, relative: string) => {
    for (const entry of readdirSync(dir)) {
      if (PRUNED.has(entry)) continue;

      const path = `${dir}/${entry}`;
      const next = `${relative}/${entry}`;

      if (statSync(path).isDirectory()) {
        walk(path, next);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      out.push(next);
    }
  };

  for (const pkg of PACKAGES) walk(`${ROOT}/packages/${pkg}/src`, `packages/${pkg}/src`);
  return out.sort();
}

/**
 * A file's text with its comments removed, so a *citation* of the archive reads
 * differently from a *use* of it. Crude on purpose — a `//` inside a string
 * (a URL) truncates that line early, which can only ever make this scan look at
 * less, never at something that is not code.
 */
function code(path: string): string {
  return readFileSync(`${ROOT}/${path}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** Every line of every source file naming `column`, as `path:line`. */
function linesNaming(column: string): string[] {
  const hits: string[] = [];

  for (const path of sourceFiles()) {
    readFileSync(`${ROOT}/${path}`, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (line.includes(column)) hits.push(`${path}:${index + 1}`);
      });
  }

  return hits;
}

/** The same, narrowed to the lines that also read as a derivation. */
function derivations(column: string): string[] {
  return linesNaming(column).filter((hit) => {
    const [path, line] = [hit.slice(0, hit.lastIndexOf(":")), Number(hit.split(":").pop())];
    return DERIVATION.test(readFileSync(`${ROOT}/${path}`, "utf8").split("\n")[line - 1]);
  });
}

describe("the raw source archive", () => {
  it("is named in code only by the files entitled to, each for a stated role", () => {
    const naming = sourceFiles().filter((path) => code(path).includes(COLUMN));

    expect(naming).toStrictEqual(ARCHIVE_SITES.map((site) => site.path));
  });

  it("still has every one of those files, so the list is not exempting nothing", () => {
    for (const { path, role } of ARCHIVE_SITES) {
      expect(existsSync(`${ROOT}/${path}`), `${path} — ${role}`).toBe(true);
    }
  });

  it("is never filtered, grouped, joined or counted on", () => {
    // No matcher reads it, no total counts it (ADR 0012 §2): the archive rides
    // along on reads and writes and answers no question of its own.
    expect(derivations(COLUMN)).toStrictEqual([]);
  });

  it("unlike the value promoted out of it, which is exactly what promotion buys", () => {
    // `counterpartyIban` is joined against `accounts.iban` to mark an
    // **IBAN-confirmed candidate**. That it shows up here and `rawSource` does
    // not is the whole division of labour — and it is what proves the scan above
    // can see a derivation at all.
    expect(derivations(PROMOTED_COLUMN).length).toBeGreaterThan(0);
  });
});
