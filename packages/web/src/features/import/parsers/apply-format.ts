import {
  type CsvStatementFormat,
  type DateOrder,
  type DecimalSeparator,
  RAW_ISSUER_JOINER,
  type SignRule,
  type StatementFormat,
} from "@mamen/shared/contract";
import { isPlausibleIban, normalizeIban } from "@/features/accounts/account-iban";
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
 * The row's **issuer string**: the mapped columns read in the order the format
 * names them and joined by {@link RAW_ISSUER_JOINER}.
 *
 * More than one column because banks split a label — a payee, a memo, a
 * reference — and each part alone identifies nothing. The format's order is the
 * user's, recorded as they assigned the columns, so a bank that writes the payee
 * second reads that way round without the parser guessing.
 *
 * **Blank parts are dropped, not spaced over.** A memo column empty on half the
 * file would otherwise leave a trailing joiner on those rows, and two rows from
 * the same shop would stop looking alike to the issuer matching this string
 * exists for. Positional stability has nothing to offer here: nobody reads this
 * string by column, and the untouched columns are in the **raw source** anyway
 * (ADR 0012).
 *
 * A missing column reads as blank and so drops out too, which is what a format
 * naming a column its file no longer carries does.
 */
function rawIssuerStringOf(row: Record<string, string>, columns: readonly string[]): string {
  return columns
    .map((column) => row[column]?.trim() ?? "")
    .filter((value) => value !== "")
    .join(RAW_ISSUER_JOINER);
}

/**
 * The **counterparty IBAN** promoted out of the row, or `undefined` when there
 * is none to promote (issue #178, PRD #175). `column` is `null` for a format
 * whose bank never writes one.
 *
 * Normalised with the very function the account-IBAN field uses — upper-case,
 * separators stripped — because the two columns exist to be *joined*, and a bank
 * that prints its IBANs in groups of four would otherwise fail that join.
 * Sharing the function rather than restating the rule is what keeps the two
 * sides of that join from drifting apart.
 *
 * A missing column, a blank one, and a value that **could not be an IBAN** all
 * yield absent. Banks write prose in this column — "not communicated", a masked
 * card number, a dash — and a string that cannot be an account number is not
 * evidence of one; promoting it would put a value in the matching column that
 * only a second junk value could ever equal. The check is the account field's
 * own {@link isPlausibleIban}: shape only, no per-country length table and no
 * mod-97 checksum, so a statement from a bank mamen has never seen still
 * imports — the same latitude, for the same reason.
 *
 * Nothing is lost by refusing: the *delivered* form stays untouched in the
 * archive either way, and unlike the account form — where the user typed it, is
 * shown the warning and is the authority on their own account number — there is
 * nobody in the loop at import time to ask. That disagreement between the column
 * and the archive is the division of labour ADR 0012 records: the column is for
 * matching, the raw source is for provenance.
 *
 * Not a {@link ValueRules} entry: there is one way to read an IBAN, so the
 * vocabulary has nothing to offer here that would not be a wrong answer.
 */
function counterpartyIbanOf(
  row: Record<string, string>,
  column: string | null,
): string | undefined {
  if (column === null) return undefined;

  const normalized = normalizeIban(row[column] ?? "");
  // `isPlausibleIban` calls empty valid — the field it guards is optional, and an
  // untouched one is "not given" rather than a failed entry. Here that answer is
  // already spelled `undefined`, so emptiness is settled first.
  if (normalized.length === 0) return undefined;
  return isPlausibleIban(normalized) ? normalized : undefined;
}

/**
 * The half of a **Statement Format** that reading a CSV actually consults: which
 * column becomes which property, and how the values are written. Everything else
 * a stored record carries — its id, its name, its account, its fingerprint — is
 * about *choosing* the format, not about applying it.
 *
 * Stated as a type so the mapping step's **format draft** can be applied by this
 * very function while it is still being authored and has no id to be applied
 * *by* (issue #186). The live preview is then the real thing rather than a
 * second reading of the rules that could disagree with the import's.
 *
 * `kind` is carried though nothing here branches on it, and since issue #218 it
 * admits **both** halves of the discriminant. What this function needs is a
 * table of string rows keyed by column names, and a *discovered* PDF statement
 * (issue #217) is exactly that — the bank's own columns, every cell as printed.
 * So a PDF format's mapping and rules genuinely do read a table client-side now,
 * which is what makes the two paths one pipeline rather than two.
 *
 * What it does not admit is a *stored* `PdfStatementFormat`'s rows: those come
 * back typed from server extraction and never pass through here. The wizard
 * narrows its stored formats to the CSV ones before it ever reaches this, so the
 * only PDF-kinded value that arrives is the draft being authored against a
 * discovered table.
 */
export type FormatToApply = Pick<CsvStatementFormat, "mapping" | "rules"> & {
  kind: StatementFormat["kind"];
};

/**
 * Apply a **Statement Format** to raw CSV rows — the primary import seam, and
 * the successor to the hand-written parsers' `parse`.
 *
 * The format is normally the stored entity itself (issue #184), fetched from the
 * account it belongs to like any other contract data — web ADR 0001 stands,
 * since the rows never leave the browser.
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
  format: FormatToApply,
  rows: ReadonlyArray<Record<string, string>>,
  ctx: ParseContext,
): ParsedRow[] {
  const { mapping, rules } = format;
  const parsed: ParsedRow[] = [];

  rows.forEach((row, sourceIndex) => {
    if (rules.filter !== null && row[rules.filter.column] !== rules.filter.equals) return;

    const date = parseDate(row[mapping.date] ?? "", rules.dateOrder);
    const counterpartyIban = counterpartyIbanOf(row, mapping.counterpartyIban);

    parsed.push({
      sourceIndex,
      record: {
        accountId: ctx.accountId,
        date,
        amount: signedAmount(row, rules.sign, rules.decimalSeparator),
        rawIssuerString: rawIssuerStringOf(row, mapping.rawIssuerString),
        // A copy rather than the row itself, so a caller reusing its parsed rows
        // cannot see one of them mutated through a record it handed us.
        rawSource: { ...row },
        // Spread rather than assigned `undefined`: the key is *absent* on a row
        // the bank gave no IBAN for, which is the shape the contract's optional
        // field and the column's null both mean.
        ...(counterpartyIban !== undefined ? { counterpartyIban } : {}),
        importMonth: importMonthKey(date),
        importBatchId: ctx.importBatchId,
      },
    });
  });

  return parsed;
}
