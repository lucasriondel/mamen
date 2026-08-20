import type { CsvStatementFormat, StatementFormat } from "@mamen/shared/contract";

/**
 * What detection concluded about a dropped **CSV** and one account's stored
 * **Statement Formats**. Four arms, because the wizard says four different
 * things: it preselects, it reports **nothing matched**, it reports **several
 * matched**, or it reports that this account has **no formats** of this kind at
 * all — distinct facts about the file and the account, not one "unrecognised"
 * catch-all.
 *
 * `no-formats` is the third of issue #186's routes into the mapping step, and it
 * is separate from `none` for the copy alone: an account nobody has set up yet
 * has not *failed* to recognise anything, and a first import that reads as a
 * failure is the dead end the mapping step exists to remove. An account holding
 * only PDF formats is here too — from the CSV path's side there is nothing that
 * could ever have read this file.
 *
 * `several` deliberately carries no formats. Nothing renders them: the picker
 * lists every CSV format the account has either way, since a user who disagrees
 * with a *successful* detection overrides it from the same control.
 */
export type FormatDetection =
  | { readonly outcome: "detected"; readonly format: CsvStatementFormat }
  | { readonly outcome: "several" }
  | { readonly outcome: "none" }
  | { readonly outcome: "no-formats" };

/**
 * The **CSV** formats among an account's, which is every format the CSV import
 * path may consider — both to detect with and to offer in the picker.
 *
 * A PDF format declares the columns to ask a model for rather than a header
 * fingerprint, so it has nothing to match a CSV's headers against; offering one
 * for a CSV is a guaranteed error (PRD #180).
 */
export function csvFormats(formats: readonly StatementFormat[]): readonly CsvStatementFormat[] {
  return formats.filter((format): format is CsvStatementFormat => format.kind === "csv");
}

/**
 * Whether a file carrying these headers is one this format can read. The
 * fingerprint is a subset test: the file may ship more columns than the format
 * names — Green-Got ships thirteen and fingerprints on five — and every column
 * beyond the mapped ones reaches the row's **raw source** anyway.
 */
export function matchesHeaders(format: CsvStatementFormat, headers: readonly string[]): boolean {
  return format.headers.every((required) => headers.includes(required));
}

/**
 * Choose the **Statement Format** to read a CSV with, from the formats stored on
 * the account it is being imported into.
 *
 * Pure, and given its candidates: formats are account-scoped rows now, so there
 * is no module-level set to fall back on, and the caller is whoever fetched
 * them. This is also what keeps every arm below reachable from a test.
 *
 * **The most specific match wins.** A bank that changes its export earns a new
 * format rather than an edit to the old one, so the newer record's fingerprint
 * is a strict superset of the older's: a file exported after the change matches
 * both and should be read by the newer, while a file exported before it matches
 * only the older. Requiring the most headers is exactly "asked the most of this
 * file", so both resolve without asking.
 *
 * A **genuine tie** — two formats demanding as much of the file as each other —
 * is not something to guess at, and stays `several`.
 */
export function detectFormat(
  headers: readonly string[],
  formats: readonly StatementFormat[],
): FormatDetection {
  const candidates = csvFormats(formats);
  // Asked before anything is matched: "this account has no format that could
  // read a CSV" is a fact about the account, and it is the one the mapping
  // step's first-import copy turns on (issue #186).
  if (candidates.length === 0) return { outcome: "no-formats" };

  const matches = candidates.filter((format) => matchesHeaders(format, headers));
  if (matches.length === 0) return { outcome: "none" };

  const demanded = Math.max(...matches.map((format) => format.headers.length));
  const strictest = matches.filter((format) => format.headers.length === demanded);
  return strictest.length === 1
    ? { outcome: "detected", format: strictest[0] }
    : { outcome: "several" };
}
