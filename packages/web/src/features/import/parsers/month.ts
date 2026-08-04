import { monthKey } from "@/lib/month";

/**
 * Derive a `YYYY-MM` import-month key from a date, in UTC. Shared by the CSV
 * parsers and the PDF enrichment so a statement spanning a month boundary splits
 * the same way regardless of source. UTC because statement dates are UTC.
 *
 * The derivation is {@link monthKey} — the same one the transaction list mints
 * its month options with (issue #87). Kept under its own name because what it
 * means here is different: this is the *provenance* stamp a row is written with,
 * not the month the row is later listed under.
 */
export function importMonthKey(date: Date): string {
	return monthKey(date);
}
