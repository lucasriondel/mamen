import type { StatementFormat } from "./format";
import { greenGotFormat } from "./formats";

/**
 * The **Statement Format** records the app can read a CSV with (per ADR 0001,
 * the import flow parses the file once with papaparse and then picks one of
 * these by header fingerprint).
 *
 * Literals in code at this stage, and deliberately so: these become rows of a
 * user-authored, account-scoped table (PRD #180), at which point this array is
 * replaced by a query rather than extended. Until then adding a bank is still a
 * code change — but it is filling in a record, not writing a module.
 */
export const FORMATS: readonly StatementFormat[] = [greenGotFormat];

/**
 * Whether a file carrying these headers is one this format can read. The
 * fingerprint is a subset test: the file may ship more columns than the format
 * names — Green-Got ships thirteen and fingerprints on five — and every column
 * beyond the mapped ones reaches the row's **raw source** anyway.
 */
export function matchesHeaders(format: StatementFormat, headers: readonly string[]): boolean {
  return format.headers.every((required) => headers.includes(required));
}

/**
 * Auto-detect the format for a file from its headers. Returns the sole match, or
 * `null` when zero or more than one format matches — the ambiguous cases where
 * the user must pick manually.
 *
 * `candidates` defaults to every registered format, which is what the wizard
 * passes. It is a parameter because detection is a property of a *set* of
 * formats rather than of the module: it is what makes the "several matched" arm
 * reachable while only one format is registered, and it is the seam the record
 * becoming an account-scoped row needs, where the candidates are one account's
 * formats (PRD #180).
 */
export function detectFormat(
  headers: readonly string[],
  candidates: readonly StatementFormat[] = FORMATS,
): StatementFormat | null {
  const matches = candidates.filter((format) => matchesHeaders(format, headers));
  return matches.length === 1 ? matches[0] : null;
}

/** Look up a format by its stable `id` (used by the manual format picker). */
export function getFormatById(id: string): StatementFormat | undefined {
  return FORMATS.find((format) => format.id === id);
}
