/**
 * The **Statement Format** vocabulary (PRD #180) — a record of how to read one
 * bank's export, expressed as data rather than as code.
 *
 * Every rule below is a **closed union**, deliberately, and not an expression
 * language: each case is then a checked branch in {@link module:apply-format}
 * and a fixed choice in the mapping UI that will author these records, instead
 * of an interpreter to secure and debug. Adding a bank is meant to be filling
 * one of these in, not writing a module.
 *
 * At this stage the records are literals in code ({@link module:formats}) —
 * nothing is stored and the contract does not carry them. The shape is what is
 * being proven: if some part of a real bank's export cannot be said here, that
 * is found now rather than after a table and endpoints have been built on it.
 */

/**
 * The closed set of transaction properties a column may become. Everything else
 * a file carries is archive (**raw source**, ADR 0012), and widening this set is
 * earned the way ADR 0012 says a column is earned.
 *
 * `accountId`, `importMonth` and `importBatchId` are never here: they are
 * derived at parse time from the {@link ParseContext} and the row's own date,
 * and no column of a statement decides them.
 *
 * `counterpartyIban` is the fourth target the PRD names. It is absent until
 * issue #175 promotes it to a real transaction column — there is nowhere to map
 * it to today, and this ticket changes no contract.
 */
export type MappedTarget = "date" | "amount" | "rawIssuerString";

/**
 * Which column becomes which property, for every target except `amount`: which
 * column(s) carry the amount is inseparable from **how the sign is written**, so
 * it is stated by {@link SignRule} instead — the debit-and-credit strategy reads
 * two columns and the other two read one.
 *
 * Written against {@link MappedTarget} so that promoting a fourth target makes
 * every format record fail to type-check until it says what fills it.
 */
export type ColumnMapping = {
  readonly [Target in Exclude<MappedTarget, "amount">]: string;
};

/**
 * How a row says whether money came in or went out. Three strategies, which is
 * what real French exports do:
 *
 * - `signed-column` — one column, the sign taken as written.
 * - `direction-column` — a magnitude column plus a column naming the direction,
 *   of which one value means a debit (Green-Got's `Direction` / `DEBIT`).
 * - `debit-credit-columns` — two columns, at most one filled per row, folded
 *   into one signed amount.
 */
export type SignRule =
  | {
      readonly strategy: "signed-column";
      readonly amountColumn: string;
    }
  | {
      readonly strategy: "direction-column";
      readonly amountColumn: string;
      readonly directionColumn: string;
      /** The value of `directionColumn` that means money left the account. */
      readonly debitValue: string;
    }
  | {
      readonly strategy: "debit-credit-columns";
      readonly debitColumn: string;
      readonly creditColumn: string;
    };

/**
 * The order a bank writes its dates in. **Never auto-detected**: `03/04/2026` is
 * unresolvable without knowing the bank, and a guess corrupts data invisibly —
 * the row still parses, still previews, and is simply the wrong day.
 */
export type DateOrder = "iso" | "day-first" | "month-first";

/**
 * Which mark separates the decimals. Same reasoning as {@link DateOrder}:
 * unguessable in general, catastrophic when wrong — read `1 929,71` with a dot
 * and it is `1`.
 *
 * Thousands separators are not part of this choice; they are always stripped.
 */
export type DecimalSeparator = "dot" | "comma";

/**
 * Keep only the rows whose `column` reads exactly `equals`. One column, one
 * value — this is how "settled operations only" is said, and it is deliberately
 * not a predicate language.
 */
export type RowFilter = {
  readonly column: string;
  readonly equals: string;
};

/** How the values in a mapped column are written. */
export type ValueRules = {
  readonly sign: SignRule;
  readonly dateOrder: DateOrder;
  readonly decimalSeparator: DecimalSeparator;
  /** `null` when every row of the file is imported. */
  readonly filter: RowFilter | null;
};

/**
 * One bank's file shape, as a record.
 *
 * `kind` is the CSV/PDF discriminant the PRD carries. Only `csv` exists here:
 * the PDF half declares the columns a model should expect rather than a header
 * fingerprint, and lands with the endpoint that needs it. The discriminant is
 * present from the start so the split stays visible rather than being
 * retrofitted over a shape that assumed one kind.
 */
export type StatementFormat = {
  /** Stable identifier — the picker's `<option>` value, and what tests name. */
  readonly id: string;
  /** The format's own name, shown in the picker. User-entered once stored. */
  readonly name: string;
  readonly kind: "csv";
  /**
   * The header fingerprint: the columns a file must carry for this format to
   * recognise it. Not the whole column set the bank ships — the archive keeps
   * that — only what identifies the file.
   */
  readonly headers: readonly string[];
  readonly mapping: ColumnMapping;
  readonly rules: ValueRules;
};
