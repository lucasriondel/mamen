import { assert, describe, it } from "@effect/vitest";
import { AI_TASKS, ExtractPdfResult } from "@mamen/shared/contract";
import { Effect } from "effect";
import { extractionPrompt } from "./prompt";
import { AI_TASK_TABLE } from "./tasks";

/**
 * The **task table** (issue #121) — one row, PDF extraction. What is worth a
 * test here is not that the row exists but the three things a wrong row would
 * break silently: the CLI prompt's wording, the two columns staying two, and
 * the tool allowance.
 */

const PDF_PATH = "/tmp/mamen-pdf-abc123/statement.pdf";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/** The columns the chosen **Statement Format** declares (issue #185). */
const COLUMNS = ["Date", "Valeur", "Libellé", "Débit", "Crédit"];
const INPUT = { pdfPath: PDF_PATH, pdfBytes: PDF_BYTES, columns: COLUMNS };

const extract = AI_TASK_TABLE["extract-pdf"];

/**
 * Everything from the rules heading on — the half of a prompt that says how to
 * read a statement, as opposed to the half that says how to get at one. The two
 * columns differ only above this line.
 */
const rulesOf = (prompt: string): string =>
  prompt.slice(prompt.indexOf("Extract every real account operation"));

describe("the table covers the catalogue", () => {
  it("has a row for every AI task, and no others", () => {
    assert.deepStrictEqual(Object.keys(AI_TASK_TABLE).sort(), [...AI_TASKS]);
  });
});

describe("the CLI column", () => {
  // The extraction prompt is the correctness surface of PDF import — sign
  // convention, which date, which year, French numbers, which rows to drop.
  // This ticket *moves* it and does not touch its wording, so the column is
  // asserted to be that prompt itself rather than a copy that could drift.
  it("is the existing extraction prompt, unchanged", () => {
    assert.strictEqual(extract.cliPrompt(INPUT), extractionPrompt(PDF_PATH, COLUMNS));
  });

  it("names the absolute path of the staged PDF", () => {
    assert.include(extract.cliPrompt(INPUT), PDF_PATH);
    assert.include(
      extract.cliPrompt(INPUT),
      "Use your Read tool to open and read the PDF at this absolute path:",
    );
  });

  it("allows the Read tool and nothing else", () => {
    assert.deepStrictEqual([...extract.allowedTools], ["Read"]);
  });
});

describe("the hosted column", () => {
  // The two columns are load-bearing, not ceremony. The CLI prompt names a path
  // on *this* machine and tells the model to open it with a tool a vendor does
  // not have; posting it would leak a local path and ask for something
  // impossible. The runner only ever sends this column to a vendor, so the
  // property worth pinning is that it is not the other one.
  it("is not the CLI prompt", () => {
    assert.notStrictEqual(extract.hostedPrompt(INPUT).text, extract.cliPrompt(INPUT));
  });

  it("carries no path off this machine", () => {
    assert.notInclude(extract.hostedPrompt(INPUT).text, PDF_PATH);
    assert.notInclude(extract.hostedInstruction, PDF_PATH);
  });

  // The document part is what makes hosted extraction possible at all: the
  // two-column Débit/Crédit layout the rules depend on survives the PDF and
  // would not survive server-side text extraction (issue #124, PRD #115).
  it("attaches the statement itself, as the bytes it was handed", () => {
    assert.deepStrictEqual(extract.hostedPrompt(INPUT).document, {
      data: PDF_BYTES,
      mediaType: "application/pdf",
    });
  });

  /**
   * The one assertion that keeps the two columns honest. They are two prompts
   * because the transports differ in how the model reaches the statement — not
   * in what it should do with it. If the rules ever diverge, the same statement
   * extracts differently depending on which vendor the user picked, and nothing
   * else in the suite would notice.
   */
  it("reads a statement by exactly the CLI column's rules", () => {
    const rules = rulesOf(extract.hostedPrompt(INPUT).text);

    assert.strictEqual(rules, rulesOf(extract.cliPrompt(INPUT)));
    assert.include(rules, "SIGN CONVENTION");
    assert.include(rules, "DECLARED TOTALS");
  });
});

/**
 * Issue #185 — the chosen **Statement Format**'s declared columns reach the
 * model. This is the whole point of making the endpoint take a format: until it
 * did, the prompt described French bank statements in general and the model
 * worked the columns out for itself, which is how a statement it has no
 * vocabulary for produces plausible rows that are silently wrong.
 */
describe("the format's declared columns", () => {
  const COLUMN_HEADING = "COLUMNS THIS STATEMENT CARRIES";

  it("names every column the chosen format declares", () => {
    const prompt = extract.cliPrompt(INPUT);

    assert.include(prompt, COLUMN_HEADING);
    for (const column of COLUMNS) assert.include(prompt, `"${column}"`);
  });

  // In the *shared* rules, not above them: a hosted vendor is asked to read the
  // same statement as the local CLI, and a columns block written into one column
  // only would be exactly the silent drift the two-column split exists to
  // prevent. Asserted through `rulesOf`, so it is the shared region that carries
  // them rather than a second copy that happens to match today.
  it("reaches the hosted column too, from the same copy", () => {
    const rules = rulesOf(extract.hostedPrompt(INPUT).text);

    assert.include(rules, COLUMN_HEADING);
    for (const column of COLUMNS) assert.include(rules, `"${column}"`);
    assert.strictEqual(rules, rulesOf(extract.cliPrompt(INPUT)));
  });

  // The columns say what the file is laid out like; they do not replace how its
  // values are read. Every rule the extraction has always run on is still in the
  // prompt beside them (issue #185's "existing extraction rules are preserved").
  it("are added to the existing rules, not in place of them", () => {
    const prompt = extract.cliPrompt(INPUT);

    for (const section of [
      "SIGN CONVENTION",
      "DATE",
      "NUMBERS (French format)",
      "LABEL",
      "ROWS TO EXCLUDE",
      "DECLARED TOTALS",
    ]) {
      assert.include(prompt, section);
    }
  });

  // A format may declare no columns at all — the contract's `columns` is an
  // array and nothing makes it non-empty. An empty heading would be worse than
  // no heading: it tells the model the statement carries nothing.
  it("say nothing at all when the format declares none", () => {
    const prompt = extract.cliPrompt({ ...INPUT, columns: [] });

    assert.notInclude(prompt, COLUMN_HEADING);
    assert.include(prompt, "SIGN CONVENTION");
  });
});

describe("the output contract", () => {
  it.effect("is the existing extraction result class", () =>
    Effect.gen(function* () {
      const decoded = yield* extract.output.decode({
        transactions: [{ date: "2026-01-15", amount: 1947.26, rawIssuerString: "VIR ACME" }],
        declaredTotals: { debit: 0, credit: 1947.26 },
      });

      assert.instanceOf(decoded, ExtractPdfResult);
      assert.strictEqual(decoded.transactions[0].amount, 1947.26);
    }),
  );
});
