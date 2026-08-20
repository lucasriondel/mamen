import type { DateOrder, DecimalSeparator, SignRule, StatementFormat } from "./format";
import { importMonthKey } from "./month";
import type { ParseContext, ParsedRow } from "./types";

/**
 * The thousands separators stripped from every number, whichever decimal mark
 * the format names: space, non-breaking space and apostrophe. `\s` covers both
 * spaces — a plain one and the U+00A0 / U+202F kinds a bank actually emits —
 * which is why they are not spelled out.
 *
 * Neither `.` nor `,` is ever a thousands separator here. Which of the two means
 * decimals is the format's to say ({@link DecimalSeparator}), and a number
 * cannot be read while both are still in play.
 */
const THOUSANDS_SEPARATORS = /[\s']/g;

/** `DD/MM/YYYY` or `MM/DD/YYYY` — any single non-digit between the parts. */
const TWO_TWO_FOUR = /^(\d{1,2})\D(\d{1,2})\D(\d{4})$/;

/**
 * Read one number the way this format writes them. Returns `NaN` for anything
 * that is not one, which is what the preview then shows the user — the point of
 * the preview being that a wrong rule is visible before it becomes stored data.
 */
function parseNumber(value: string, separator: DecimalSeparator): number {
  const stripped = value.replace(THOUSANDS_SEPARATORS, "");
  return Number.parseFloat(separator === "comma" ? stripped.replace(",", ".") : stripped);
}

/** The same, but an empty cell is a zero — the blank half of a debit/credit pair. */
function parseNumberOrZero(value: string | undefined, separator: DecimalSeparator): number {
  if (value === undefined || value.trim() === "") return 0;
  return parseNumber(value, separator);
}

/**
 * Read one date the way this format writes them.
 *
 * `iso` hands the string to `Date` unchanged, which is what makes a full ISO
 * instant (`2026-01-31T23:30:00.000Z`) keep its time. The two ambiguous orders
 * are read positionally and built in **UTC**, matching {@link importMonthKey},
 * so a day-first date can never be read month-first by accident — the order is
 * the format's declaration, never a guess about the value.
 *
 * A value the declared order cannot read yields an Invalid Date rather than a
 * plausible wrong one.
 */
function parseDate(value: string, order: DateOrder): Date {
  if (order === "iso") return new Date(value);

  const match = TWO_TWO_FOUR.exec(value.trim());
  if (!match) return new Date(Number.NaN);

  const [, first, second, year] = match;
  const [day, month] = order === "day-first" ? [first, second] : [second, first];
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/**
 * Fold a row's columns into one signed amount, by the strategy the format
 * declares. Every branch is checked: a new strategy makes this stop compiling.
 *
 * Under `debit-credit-columns` each cell is a **magnitude** and the sign comes
 * from which column it sits in, so the fold is `credit - debit` with a blank
 * cell counting as zero. A row filling both — which a well-formed export does
 * not do — therefore nets rather than picking one.
 */
function signedAmount(
  row: Record<string, string>,
  sign: SignRule,
  separator: DecimalSeparator,
): number {
  switch (sign.strategy) {
    case "signed-column":
      return parseNumber(row[sign.amountColumn] ?? "", separator);
    case "direction-column": {
      const magnitude = parseNumber(row[sign.amountColumn] ?? "", separator);
      return row[sign.directionColumn] === sign.debitValue ? -magnitude : magnitude;
    }
    case "debit-credit-columns":
      return (
        parseNumberOrZero(row[sign.creditColumn], separator) -
        parseNumberOrZero(row[sign.debitColumn], separator)
      );
  }
}

/**
 * Apply a **Statement Format** to raw CSV rows — the primary import seam, and
 * the successor to the hand-written parsers' `parse`.
 *
 * Pure: a format, the rows, and the context the file cannot supply go in;
 * records come out. No file I/O and no network, which is what keeps client-side
 * parsing (web ADR 0001) testable without standing anything up.
 *
 * Rows the format's filter rejects are simply absent from the output, so a
 * record's place here says nothing about its row's — each one reports the
 * `sourceIndex` it was read from, which is how the preview puts a row's
 * **stable row id** on the record it produced (issue #192).
 *
 * Nothing is dropped: the whole row is archived verbatim as **raw source**
 * (issue #176, ADR 0012), every key kept including the mapped ones. Which
 * columns the format maps decides what is *promoted*, never what is kept.
 */
export function applyFormat(
  format: StatementFormat,
  rows: ReadonlyArray<Record<string, string>>,
  ctx: ParseContext,
): ParsedRow[] {
  const { mapping, rules } = format;
  const parsed: ParsedRow[] = [];

  rows.forEach((row, sourceIndex) => {
    if (rules.filter !== null && row[rules.filter.column] !== rules.filter.equals) return;

    const date = parseDate(row[mapping.date] ?? "", rules.dateOrder);

    parsed.push({
      sourceIndex,
      record: {
        accountId: ctx.accountId,
        date,
        amount: signedAmount(row, rules.sign, rules.decimalSeparator),
        rawIssuerString: row[mapping.rawIssuerString],
        // A copy rather than the row itself, so a caller reusing its parsed rows
        // cannot see one of them mutated through a record it handed us.
        rawSource: { ...row },
        importMonth: importMonthKey(date),
        importBatchId: ctx.importBatchId,
      },
    });
  });

  return parsed;
}
