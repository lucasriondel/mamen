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

Return only the structured object: the array of transactions and the declared totals.`;

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
