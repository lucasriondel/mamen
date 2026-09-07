import type { DateOrder } from "@mamen/shared/contract";
import type { FormatToApply } from "./apply-format";

/**
 * A blank line of a **transcribed** statement table — the row the preview
 * appends when the user adds an operation the model missed (issue #220).
 *
 * It is written in the statement's own vocabulary, because that is what the row
 * *is*: the cells go under the bank's column names and every value is a string,
 * so the format re-reads this row exactly as it reads a transcribed one and the
 * user corrects it in the same cells.
 *
 * "Blank" is therefore the format's word, not an empty object. Three cells are
 * seeded, and each one is seeded because leaving it empty would make the control
 * do nothing visible:
 *
 * - **The date column.** An unreadable date is an `Invalid Date`, and the table
 *   beside this row formats every date it shows — so an empty cell would take
 *   the whole preview down rather than show a row waiting to be filled in.
 *   Today's date is the same starting value `add-extracted` seeds on the
 *   format-driven path, and the user types over it.
 * - **The single amount column**, where the strategy has one. `parseNumber("")`
 *   is `NaN`, which reaches the user as `NaN €`. A debit/credit *pair* needs no
 *   seed: a blank half of that pair already reads as zero, which is what the
 *   pair means.
 * - **The filter's column**, where the format declares a filter. A row the
 *   format's own row filter drops is one the user cannot see, so an added row
 *   would simply never appear — the control would look broken rather than
 *   filtered.
 *
 * Every other column is **absent**, not empty: the row's **raw source** is what
 * the user actually supplied (ADR 0012), and a hand-added row that claimed a
 * blank cell in each of the bank's thirteen columns would be claiming a
 * statement line that does not exist.
 */
export function blankRow(format: FormatToApply, today: Date): Record<string, string> {
  const { mapping, rules } = format;

  const row: Record<string, string> = {
    [mapping.date]: writeDate(today, rules.dateOrder),
  };
  if (rules.sign.strategy !== "debit-credit-columns") row[rules.sign.amountColumn] = "0";
  if (rules.filter !== null) row[rules.filter.column] = rules.filter.equals;

  return row;
}

/**
 * A date written the way this format says its bank writes them — the inverse of
 * the reading `applyFormat` does, so what is seeded here parses back to the same
 * day. UTC throughout, matching that reading.
 *
 * Every order is spelled out: a new one makes this stop compiling rather than
 * silently seed a date the format cannot read.
 */
function writeDate(date: Date, order: DateOrder): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  switch (order) {
    case "iso":
      return `${year}-${month}-${day}`;
    case "day-first":
      return `${day}/${month}/${year}`;
    case "month-first":
      return `${month}/${day}/${year}`;
  }
}
