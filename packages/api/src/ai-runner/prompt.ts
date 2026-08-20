/**
 * The extraction prompts (issue #44, PRD #34; the hosted one, issue #124). This
 * is the correctness surface of the whole slice: the `ExtractedTransaction`
 * schema pins the *shape*, but only the prompt makes the *values* right — sign
 * convention, which date, which year, French number parsing, and which rows to
 * drop.
 *
 * There are two prompts because there are two transports, and they differ in
 * **exactly one paragraph**: how the model gets at the statement. The `claude`
 * CLI reads the PDF itself through its own `Read` tool (the handler passes
 * `addDirs` + `allowedTools: ["Read"]`), so its prompt names the absolute path
 * and tells the model to open it; a hosted vendor has neither tools nor a
 * filesystem, so the statement is handed to it as a document part and its prompt
 * says so. `generateObject` supplies the JSON schema separately on both, so
 * neither describes output plumbing.
 *
 * Everything after that paragraph — the rules that make the values right — is
 * {@link EXTRACTION_RULES}, written once. Two copies of the semantics would be
 * two things to keep in step, and the drift would be silent: a statement
 * extracted by the vendor the user chose would quietly disagree with the same
 * statement extracted locally. The CLI prompt's own text is **unchanged** by the
 * split, which `tasks.test.ts` holds byte-for-byte.
 */

/**
 * What the chosen **Statement Format** says this bank's statement is laid out
 * like (issue #185, PRD #180).
 *
 * Until a format was sent with the file, the prompt described French bank
 * statements *in general* and the model worked the columns out for itself — so a
 * statement it had no vocabulary for produced plausible rows that were silently
 * wrong, and the only backstop was the user reading every line. The columns
 * mamen already knows are told to it instead.
 *
 * The columns are named, not mapped: which of them carries the date, the amount
 * or the label is the format's `mapping`, and on the PDF path it is the *rules
 * below* that say how to read a value out of a French statement. This block says
 * only what the file contains, which is exactly what the model could not know.
 *
 * A format that declares none produces nothing at all rather than an empty
 * heading — a list of no columns reads as "this statement carries nothing".
 */
const declaredColumns = (columns: readonly string[]): string =>
  columns.length === 0
    ? ""
    : `COLUMNS THIS STATEMENT CARRIES
- The user has told mamen this bank's statement is laid out in these columns:
${columns.map((column) => `  - "${column}"`).join("\n")}
- Read the operation rows against those columns. They are what the statement
  carries; do not invent one the list does not name.

`;

/**
 * The **format verdict** the model is asked for (issue #188, PRD #180) — did
 * this statement actually carry the columns the chosen **Statement Format**
 * declares?
 *
 * The user picks which format reads a file, and can pick the wrong one. Until
 * this was asked, nothing said so: the columns went into the prompt and rows came
 * back regardless, so a wrong format read as a successful import and the only
 * backstop was the user checking every line *after* deciding to commit.
 *
 * Three things it is careful about:
 *
 * - **The observation, never the conclusion.** The model is asked which declared
 *   columns it could not find, and not whether that is a match — that fold is the
 *   server's, and it is what keeps the verdict's two fields from contradicting.
 * - **Only the declared columns.** A column name from anywhere else says nothing
 *   about the format the user chose; the server drops it anyway, and asking for it
 *   would invite a list of what the statement has *instead*, which is a different
 *   (and later) question.
 * - **Report, don't refuse.** The rows still come back. A mismatch is something the
 *   wizard routes on, not a reason for the extraction to return nothing.
 *
 * Unconditional, unlike the columns block: the field is required in the answer,
 * so it is asked for even when there is no list to check against — where the only
 * possible answer is an empty one.
 */
const FORMAT_MATCH = `FORMAT MATCH
- The user chose which statement format reads this file, and they may have chosen wrong.
- Return \`missingColumns\`: every column named in the COLUMNS list above that this
  statement does NOT actually carry. Return an empty array when it carries them all, and
  when no columns were listed above.
- Only ever name columns from that list. Do not report what the statement carries instead.
- Extract the operations either way: this reports on the format, it does not stop the read.
`;

/**
 * The **raw source** the model is asked to keep for each row (issue #189, PRD
 * #180, ADR 0012) — the operation's own cells, as the statement printed them.
 *
 * The CSV path has archived the delivered row since #176, and issue #175
 * excluded the PDF path on the premise that there is no original row to keep.
 * The declared columns (#185) make that false: a model told which columns to
 * expect returns a table of exactly those, and a table has rows.
 *
 * Two things it insists on, and both are the point of an archive:
 *
 * - **The statement's own words as keys.** The same untranslated provenance the
 *   CSV archive keeps, so what the user reads back matches the statement they
 *   downloaded.
 * - **As printed as values.** Every other rule here says how to *read* a value —
 *   fold the sign, parse the French number, merge the wrapped label. This one
 *   says not to: `1 929,71` is archived as written while `amount` carries
 *   `1929.71`. The two are allowed to disagree, and that disagreement is the
 *   division of labour — the fields are for arithmetic, the archive is for
 *   provenance.
 *
 * A blank cell is **omitted**, which is the one place this parts company with
 * the CSV archive — there an empty column is still a column the bank sent, and
 * the header row proves it. A statement line has cells only where something was
 * printed, so asking for an empty string would be asking the model to report an
 * absence it inferred, and reporting absences is what `missingColumns` is for.
 *
 * Unconditional, like the verdict and unlike the columns block: the field is
 * required in the answer, so a format that declares no columns is asked for it
 * too, where the only possible answer is an empty object.
 */
const ROW_ARCHIVE = `THE ROW AS PRINTED
- For every operation you emit, also return \`rawSource\`: that row's own cells, as an
  object keyed by the column names from the COLUMNS list above.
- Use the statement's own words as keys — do not translate or rename them.
- Values are the cell text **exactly as printed**, including French number formatting and
  any leading zeros: this is a record of what the statement said, not of what you read
  out of it. Put the parsed values in \`date\` and \`amount\` as the rules above say.
- Omit a column this row leaves blank. Return an empty object if there is nothing to
  record, and when no columns were listed above.
`;

/**
 * How to read a French bank statement, once. Shared verbatim by both prompts;
 * everything above it is transport-specific and everything in it is not — the
 * declared columns included, since a hosted vendor and the local CLI are being
 * asked to read the *same* statement.
 */
const extractionRules = (columns: readonly string[]): string =>
  `Extract every real account operation into structured data. Follow these rules exactly:

${declaredColumns(columns)}SIGN CONVENTION
- The statement lists amounts in two columns: "Débit" (money out) and "Crédit" (money in).
- Fold them into ONE signed \`amount\`: a Débit is NEGATIVE, a Crédit is POSITIVE.
- Each operation has an amount in exactly one column.

DATE
- Use the operation date ("Date"), NOT the value date ("Valeur"), when both are shown.
- The per-row dates usually carry only day and month. Infer the YEAR from the statement
  header / period (e.g. "au 31/01/2026" ⇒ 2026). If an operation's day/month falls in a
  month that belongs to the previous year given the statement period, use the year that
  makes the date fall inside the statement's period.
- Output each date in ISO \`YYYY-MM-DD\` form.

NUMBERS (French format)
- French statements write \`1 929,71\` (space as thousands separator, comma as decimal).
  Parse that to the number \`1929.71\`. Never keep the space or the comma.

LABEL
- \`rawIssuerString\` is the operation's description/label. When a description spans
  multiple lines, MERGE them into a single string (collapse the wrapping into spaces).

ROWS TO EXCLUDE (do NOT emit these as transactions)
- Balance lines: "ANCIEN SOLDE CRÉDITEUR", "NOUVEAU SOLDE CRÉDITEUR", any "SOLDE" line.
- Summary lines: "TOTAL DES OPÉRATIONS".
- Any balances for OTHER accounts printed on later pages (e.g. Livret A, LDDS, CEL) — this
  statement is for the current/cheque account only.

DECLARED TOTALS
- Separately, read the statement's own "TOTAL DES OPÉRATIONS" line and return its two
  printed figures as \`declaredTotals\`: \`debit\` = the total debit figure, \`credit\` = the
  total credit figure. Both are POSITIVE magnitudes exactly as printed (parse French
  numbers the same way). This is the bank's own total, not a sum you compute.
- Not every statement prints one. If there is no such line, set \`declaredTotals\` to null.
  Never add up the operations yourself to fill it in, and never report totals of 0 for a
  statement that simply does not declare any — both would be your arithmetic presented as
  the bank's.

${ROW_ARCHIVE}
${FORMAT_MATCH}
Return only the structured object: the transactions with their rows as printed, the declared
totals and the missing columns.`;

/** The CLI transport's prompt: the model opens the staged file itself. */
export const extractionPrompt = (pdfPath: string, columns: readonly string[]): string =>
  `You are extracting transactions from a French bank statement (relevé de compte) PDF.

Use your Read tool to open and read the PDF at this absolute path:
${pdfPath}

${extractionRules(columns)}`;

/**
 * The hosted transport's prompt — the system message a vendor is given.
 *
 * It names no path and no tool, because a vendor has neither: the statement
 * travels with the request as a document part, attached to the user turn
 * ({@link HOSTED_EXTRACTION_INSTRUCTION}) beside it. That is the whole
 * difference from the CLI column; the rules below the paragraph are the same
 * ones, from the same constant.
 */
export const hostedExtractionPrompt = (columns: readonly string[]): string =>
  `You are extracting transactions from a French bank statement (relevé de compte) PDF.

The statement is attached to the user's message as a PDF document. Read it directly — there is no file to open and no tool to call.

${extractionRules(columns)}`;

/**
 * The hosted transport's user turn — the one line the document rides beside,
 * because a content part exists only inside a message and the prompt above is a
 * system message.
 */
export const HOSTED_EXTRACTION_INSTRUCTION =
  "Extract the transactions from the attached bank statement PDF, following the rules above.";
