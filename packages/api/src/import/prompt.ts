/**
 * The extraction prompt (issue #44, PRD #34). This is the correctness surface
 * of the whole slice: the `ExtractedTransaction` schema pins the *shape*, but
 * only the prompt makes the *values* right — sign convention, which date,
 * which year, French number parsing, and which rows to drop.
 *
 * The `claude` CLI reads the PDF itself through its own `Read` tool (the handler
 * passes `addDirs` + `allowedTools: ["Read"]`), so the prompt names the absolute
 * path and tells the model to open it. `generateObject` supplies the JSON schema
 * separately, so the prompt describes semantics, not output plumbing.
 */
export const extractionPrompt = (pdfPath: string): string =>
	`You are extracting transactions from a French bank statement (relevé de compte) PDF.

Use your Read tool to open and read the PDF at this absolute path:
${pdfPath}

Extract every real account operation into structured data. Follow these rules exactly:

SIGN CONVENTION
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
