import { formatCurrency, formatShortDate } from "@/lib/format";

/**
 * What a previewed cell reads as when the format could not read it.
 *
 * A **Statement Format** answers `Invalid Date` / `NaN` for a value its declared
 * rules cannot make sense of — a `03/04/2026` read as ISO, a `1 929,71` read
 * with a full stop for a decimal mark — because the preview is where a wrong
 * rule is meant to become visible before it becomes stored data (PRD #180). Both
 * previews therefore have to *render* those two, and neither may pass them to a
 * formatter: `Intl.DateTimeFormat` throws on a non-finite instant, so a single
 * unreadable date would take the whole step down rather than show the row
 * waiting to be corrected.
 *
 * That matters twice over since issue #220: a transcribed cell is edited in
 * place, so a half-typed date is a state the table renders on every keystroke —
 * clearing one must show the user an unreadable row, not an error boundary.
 *
 * One module so the mapping step's live preview and the preview step's table
 * say the same words for the same fact. They read the same file through the same
 * rules, and "Unreadable date" on one screen and a crash on the next would be
 * two answers to one question.
 */

/** A parsed date, or the words for one the format could not read. */
export function readableDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? "Unreadable date" : formatShortDate(date);
}

/** A parsed amount, or the words for one the format could not read. */
export function readableAmount(amount: number): string {
  return Number.isNaN(amount) ? "Unreadable amount" : formatCurrency(amount);
}
