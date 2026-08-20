import { assert, describe, it } from "@effect/vitest";
import { AI_TASKS, ExtractPdfResult } from "@mamen/shared/contract";
import { Effect } from "effect";
import { extractionPrompt } from "./prompt";
import { AI_TASK_TABLE, ExtractionOutput } from "./tasks";

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

/**
 * Issue #196 — the totals rule stops assuming there is a totals line. A Trade
 * Republic statement prints none, and a model asked for a figure that is not on
 * the page either invents one or reports zero; both read downstream as a
 * statement whose rows do not add up.
 *
 * In the shared rules, like every other reading rule: a hosted vendor and the
 * local CLI are being asked to read the same statement, and one column allowed
 * to make totals up is the drift the two-column table exists to prevent.
 */
describe("a statement that prints no totals", () => {
  it("is told to answer with no totals rather than invent them", () => {
    const rules = rulesOf(extract.hostedPrompt(INPUT).text);

    assert.include(rules, "no such line");
    assert.include(rules, "`declaredTotals` to null");
    // The two ways a model fills a field it cannot read, both refused: summing
    // the operations (which would make the reconciliation check compare mamen's
    // arithmetic to itself and always agree) and reporting zeroes (which would
    // make it disagree with every row on the statement).
    assert.include(rules, "Never add up the operations yourself");
    assert.include(rules, "never report totals of 0");
    assert.strictEqual(rules, rulesOf(extract.cliPrompt(INPUT)));
  });
});

/**
 * Issue #188 — the model reports whether the statement it read actually carries
 * the columns the chosen format declares. The columns reaching the prompt (#185)
 * are what make the question askable at all: until they did, there was nothing
 * for a statement to match or fail to match.
 *
 * The model is asked for the *observation* — which declared columns it could not
 * find — and never for the conclusion. Whether that counts as a match is the
 * server's fold (`import/extract.ts`), which is what keeps the two halves of the
 * verdict from contradicting each other.
 */
describe("the format-match verdict", () => {
  const VERDICT_HEADING = "FORMAT MATCH";

  it("asks which of the declared columns the statement does not carry", () => {
    const prompt = extract.cliPrompt(INPUT);

    assert.include(prompt, VERDICT_HEADING);
    assert.include(prompt, "missingColumns");
  });

  // Same reasoning as the columns themselves: a hosted vendor and the local CLI
  // read the *same* statement, so a verdict asked of one only would make the
  // answer depend on which vendor the user happens to have chosen.
  it("is asked of the hosted column too, from the same copy", () => {
    const rules = rulesOf(extract.hostedPrompt(INPUT).text);

    assert.include(rules, VERDICT_HEADING);
    assert.strictEqual(rules, rulesOf(extract.cliPrompt(INPUT)));
  });

  // The field is required in the answer, so it is asked for unconditionally —
  // unlike the columns block, which says nothing when there is nothing to say.
  it("is asked for even when the format declares no columns", () => {
    assert.include(extract.cliPrompt({ ...INPUT, columns: [] }), VERDICT_HEADING);
  });

  // A mismatch is a *report*, not a refusal: the rows still come back, and what
  // to do about the wrong format is the user's decision in the wizard.
  it("asks for the rows either way, so a mismatch is reported rather than obeyed", () => {
    assert.include(extract.cliPrompt(INPUT), "Extract the operations either way");
  });
});

/**
 * Issue #189 — the model returns each operation's own cells, so a PDF row gets
 * the **raw source** the CSV path has had since #176.
 *
 * The columns reaching the prompt (#185) are what makes this askable: until the
 * model was told which columns the statement carries, there was no row-shaped
 * thing to archive and issue #175 excluded PDF rows on exactly that premise. The
 * cells are asked for in the statement's own words, and *as printed* — the
 * archive is what the bank sent, not what mamen made of it.
 */
describe("the row's raw source", () => {
  const ARCHIVE_HEADING = "THE ROW AS PRINTED";

  it("asks for each row's own cells, keyed by the columns the format declares", () => {
    const prompt = extract.cliPrompt(INPUT);

    assert.include(prompt, ARCHIVE_HEADING);
    assert.include(prompt, "rawSource");
  });

  // Same reasoning as the columns and the verdict: a hosted vendor and the local
  // CLI read the *same* statement, so an archive asked of one only would make a
  // row's provenance depend on which vendor the user happens to have chosen.
  it("is asked of the hosted column too, from the same copy", () => {
    const rules = rulesOf(extract.hostedPrompt(INPUT).text);

    assert.include(rules, ARCHIVE_HEADING);
    assert.strictEqual(rules, rulesOf(extract.cliPrompt(INPUT)));
  });

  /**
   * The archive keeps the *delivered* form, which is the whole of its value: a
   * French number is parsed into `amount` and left alone here, so what the
   * statement printed survives beside what mamen read out of it. This is the
   * same disagreement `counterpartyIban` has with the archive on the CSV path,
   * and ADR 0012 calls it the division of labour.
   */
  it("asks for the cells exactly as printed, not parsed", () => {
    assert.include(extract.cliPrompt(INPUT), "exactly as printed");
  });

  // Required in the answer, so it is asked for unconditionally — a format that
  // declares no columns has nothing to key an archive by, and the only possible
  // answer is an empty one.
  it("is asked for even when the format declares no columns", () => {
    assert.include(extract.cliPrompt({ ...INPUT, columns: [] }), ARCHIVE_HEADING);
  });
});

describe("the output contract", () => {
  it.effect("is the rows, the totals and the columns the model could not find", () =>
    Effect.gen(function* () {
      const decoded = yield* extract.output.decode({
        transactions: [
          {
            date: "2026-01-15",
            amount: 1947.26,
            rawIssuerString: "VIR ACME",
            rawSource: { Libellé: "VIR ACME", Crédit: "1 947,26" },
          },
        ],
        declaredTotals: { debit: 0, credit: 1947.26 },
        missingColumns: ["Débit"],
      });

      assert.instanceOf(decoded, ExtractionOutput);
      assert.strictEqual(decoded.transactions[0].amount, 1947.26);
      assert.deepStrictEqual([...decoded.missingColumns], ["Débit"]);
    }),
  );

  /**
   * Issue #189 — each row's cells come back keyed by the statement's own column
   * names, with the values as the statement printed them. The parsed `amount`
   * and the printed `Crédit` disagree on purpose: one is for arithmetic, the
   * other is provenance.
   */
  it.effect("carries each row's own cells, in the statement's own words", () =>
    Effect.gen(function* () {
      const decoded = yield* extract.output.decode({
        transactions: [
          {
            date: "2026-01-15",
            amount: 1947.26,
            rawIssuerString: "VIR ACME",
            rawSource: { Libellé: "VIR ACME", Crédit: "1 947,26" },
          },
        ],
        declaredTotals: { debit: 0, credit: 1947.26 },
        missingColumns: [],
      });

      assert.deepStrictEqual(
        { ...decoded.transactions[0].rawSource },
        {
          Libellé: "VIR ACME",
          Crédit: "1 947,26",
        },
      );
    }),
  );

  /**
   * The archive is **required** of the model, for the reason `missingColumns`
   * is: a silence would fold into "this row had nothing to keep", which is the
   * very premise (#175's "there is no original row") this ticket exists to make
   * false. The schema travels as the tool's own input schema, so a required
   * field is one the provider enforces, and an answer without it fails loudly
   * and retryably (`ExtractionFailed`, 502) rather than importing rows with no
   * provenance.
   */
  it.effect("refuses a row that archives nothing at all", () =>
    Effect.gen(function* () {
      const issues = yield* Effect.flip(
        extract.output.decode({
          transactions: [{ date: "2026-01-15", amount: 1947.26, rawIssuerString: "VIR ACME" }],
          declaredTotals: { debit: 0, credit: 1947.26 },
          missingColumns: [],
        }),
      );

      const [first] = issues as ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey> }>;
      assert.deepStrictEqual([...first.path], ["transactions", 0, "rawSource"]);
    }),
  );

  /**
   * Issue #196 — not every statement prints a `TOTAL DES OPÉRATIONS` line, and
   * until this the model was asked for two figures that were not on the page.
   * `null` is the answer for "there is no totals line", and it is a *required*
   * null for the same reason `missingColumns` is required: a silence would be
   * folded into an answer nobody gave. The endpoint turns it into an absent
   * field, and the client's reconciliation check skips rather than reconciling
   * against an assumed zero.
   */
  it.effect("takes null totals from a statement that prints none", () =>
    Effect.gen(function* () {
      const decoded = yield* extract.output.decode({
        transactions: [],
        declaredTotals: null,
        missingColumns: [],
      });

      assert.strictEqual(decoded.declaredTotals, null);
    }),
  );

  it.effect("refuses an answer that says nothing about the totals at all", () =>
    Effect.gen(function* () {
      const issues = yield* Effect.flip(
        extract.output.decode({ transactions: [], missingColumns: [] }),
      );

      const [first] = issues as ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey> }>;
      assert.deepStrictEqual([...first.path], ["declaredTotals"]);
    }),
  );

  /**
   * `missingColumns` is **required**, not defaulted to empty. An answer that
   * omits it is not an answer to the question this ticket asks — and folding a
   * silence into "everything matched" would restore exactly the silent wrongness
   * the verdict exists to end. The schema goes to the model as the tool's own
   * input schema, so a required field is one the provider enforces; a missing one
   * fails loudly and retryably (`ExtractionFailed`, 502).
   */
  it.effect("refuses an answer that reports no verdict at all", () =>
    Effect.gen(function* () {
      const issues = yield* Effect.flip(
        extract.output.decode({
          transactions: [],
          declaredTotals: { debit: 0, credit: 0 },
        }),
      );

      // `decode`'s error channel is the adapter's `unknown`; what it actually
      // carries is the `ArrayFormatter` issues, as `codec.test.ts` pins.
      const [first] = issues as ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey> }>;
      assert.deepStrictEqual([...first.path], ["missingColumns"]);
    }),
  );

  // The contract class the *endpoint* answers with is a different shape: it
  // carries the folded verdict, which the model is never asked for.
  it("is not the endpoint's own result class", () => {
    assert.notStrictEqual(ExtractionOutput, ExtractPdfResult as unknown);
  });
});
