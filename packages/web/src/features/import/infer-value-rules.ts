import type { ColumnField } from "./column-fields";
import type { FormatDraft } from "./parsers/format-draft";
import { inferDateOrder } from "./parsers/infer-date-order";
import { inferDecimalSeparator } from "./parsers/infer-decimal-separator";

/**
 * Which of the two **value rules** the user has answered *themselves*.
 *
 * The whole of the override rule, and the reason it is not read off the draft:
 * `dateOrder: "day-first"` says the field has a value, not who put it there, and
 * inference has to be able to tell its own answer from the user's. A field the
 * user has touched is theirs, and no later column change may take it back — a
 * user who corrected the date order and then remapped the amount column would
 * otherwise watch their correction vanish for reasons nothing on screen
 * explains.
 *
 * Component state rather than the draft's: it is a fact about what the user has
 * done in this form, like `activeColumn` and `picking` beside it, and nothing
 * saved with the format depends on it.
 */
export type TouchedValueRules = {
  readonly dateOrder: boolean;
  readonly decimalSeparator: boolean;
};

/** Nothing answered by hand yet — what the mapping step opens on. */
export const NOTHING_TOUCHED: TouchedValueRules = { dateOrder: false, decimalSeparator: false };

/**
 * The fields whose column feeds the **decimal separator**: every column that
 * holds a number under some sign strategy.
 *
 * All three, because which ones the form is asking is the strategy's business
 * and the amount is a number under every one of them. A debit/credit pair
 * contributes both halves — each is a column of magnitudes written the bank's
 * one way — so mapping either is a reason to re-read.
 */
const AMOUNT_FIELDS: readonly ColumnField[] = ["amount", "debit", "credit"];

/** Every column the draft currently reads a number from, blanks excluded. */
function amountColumns(draft: FormatDraft): readonly string[] {
  const { sign } = draft;
  switch (sign.strategy) {
    case "signed-column":
    case "direction-column":
      return sign.amountColumn === "" ? [] : [sign.amountColumn];
    case "debit-credit-columns":
      return [sign.debitColumn, sign.creditColumn].filter((column) => column !== "");
  }
}

/** One column's values down the sample, as written. */
function columnValues(
  rows: ReadonlyArray<Record<string, string>>,
  column: string,
): readonly string[] {
  return rows.map((row) => row[column] ?? "");
}

/**
 * The **value rules** a freshly-assigned column now proves, as a draft patch —
 * empty when it proves nothing, and empty for every field the user has answered
 * by hand.
 *
 * Run *after* a column assignment has been folded into the draft, so `draft` is
 * the draft as it now stands and the columns read here are the ones just
 * chosen. That ordering is what lets a debit/credit pair re-read both halves
 * together on the second assignment: the first gives one column of magnitudes,
 * the second gives two, and the wider sample is the better evidence.
 *
 * Three things have to hold before a field is set, and each is a separate
 * refusal:
 *
 * - the assigned field must actually feed that rule — remapping the IBAN column
 *   says nothing about how dates are written;
 * - the user must not have answered it by hand ({@link TouchedValueRules});
 * - the sample must genuinely prove it, which is the inference functions' own
 *   `ambiguous` arm. A file of `01/02/2026` leaves the field exactly as it was,
 *   which on a fresh draft is unanswered — PRD #180's refusal to guess,
 *   preserved precisely where the file gives nothing to read.
 *
 * Inference **re-runs on every untouched assignment**, including one that
 * replaces a column it already concluded from. A user who mapped the wrong date
 * column and then fixed it gets the new column's reading, not the old one's:
 * the previous value was never the user's answer, so there is nothing to
 * protect.
 */
export function inferredValueRules(
  draft: FormatDraft,
  field: ColumnField,
  rows: ReadonlyArray<Record<string, string>>,
  touched: TouchedValueRules,
): Partial<FormatDraft> {
  if (field === "date" && !touched.dateOrder && draft.mapping.date !== "") {
    const inference = inferDateOrder(columnValues(rows, draft.mapping.date));
    if (inference.outcome === "inferred") return { dateOrder: inference.order };
    return {};
  }

  if (AMOUNT_FIELDS.includes(field) && !touched.decimalSeparator) {
    const columns = amountColumns(draft);
    if (columns.length === 0) return {};
    // Every amount column at once, not just the one assigned: the sample is
    // cross-checked whole, and a debit column of round figures is settled by
    // the credit column beside it.
    const values = columns.flatMap((column) => columnValues(rows, column));
    const inference = inferDecimalSeparator(values);
    if (inference.outcome === "inferred") return { decimalSeparator: inference.separator };
  }

  return {};
}
