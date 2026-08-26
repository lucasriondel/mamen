import type {
  AccountId,
  ColumnMapping,
  DateOrder,
  DecimalSeparator,
  RowFilter,
  SignRule,
  StatementFormatCreate,
} from "@mamen/shared/contract";
import type { FormatToApply } from "./apply-format";

/**
 * A **Statement Format** under construction — what the mapping step holds while
 * the user builds one against the file in front of them (issue #186, PRD #180).
 *
 * It is the contract's create payload with three things taken out and two
 * loosened:
 *
 * - `accountId` and `headers` are not the user's to answer. The account was
 *   settled before the file was taken (issue #181) and the fingerprint is the
 *   dropped file's own header row, so both are supplied by
 *   {@link draftCreate} at the moment of saving rather than carried here as a
 *   second copy of state the wizard already holds.
 * - `kind` is `csv` and not a choice. A PDF format declares the columns to ask a
 *   model for and has no file of rows to preview a mapping against, so it cannot
 *   be authored from the file in front of the user the way this step means it.
 * - `dateOrder` and `decimalSeparator` are **nullable here and only here**. The
 *   contract has no unset case because a stored format must have answered; a
 *   *draft* has to be able to say "not yet", or the form would open with a
 *   default that is a guess the user never made. These are the two rules PRD
 *   #180 refuses to auto-detect, for the same reason: read `03/04/2026` as ISO
 *   and it is the 4th of March, which still looks like a date.
 * - the sign rule's columns and the filter's halves may be blank strings — a
 *   half-answered rule is still a shape the form has to hold.
 *
 * The nested `rules` object is flattened into four fields, because a form edits
 * one rule at a time and the reducer's patch is over top-level fields;
 * {@link draftRules} folds them back into the contract's shape.
 */
export type FormatDraft = {
  name: string;
  /**
   * `""` for a target the user has not mapped yet, `null` IBAN means none, and
   * an **empty label list** is the label question still unanswered — a draft's
   * spelling of "not yet", where a stored format's list is never empty.
   */
  mapping: ColumnMapping;
  sign: SignRule;
  /** `null` until the user says — never defaulted, never detected. */
  dateOrder: DateOrder | null;
  /** `null` until the user says — never defaulted, never detected. */
  decimalSeparator: DecimalSeparator | null;
  /** `null` when every row of the file is imported. */
  filter: RowFilter | null;
};

/**
 * A draft that declares nothing. The mapping step opens on this: every column
 * unmapped, both unguessable rules unanswered, no filter.
 *
 * The sign rule is the one exception, and it is not a guess about the file: a
 * strategy has to be chosen for the form to know *which* column questions to
 * ask, and the simplest one asks for a single column that is still blank — so
 * the draft cannot be completed without the user answering it.
 */
export function blankDraft(): FormatDraft {
  return {
    name: "",
    mapping: { date: "", rawIssuerString: [], counterpartyIban: null },
    sign: { strategy: "signed-column", amountColumn: "" },
    dateOrder: null,
    decimalSeparator: null,
    filter: null,
  };
}

/** Whether every column a sign strategy reads has been named. */
function signAnswered(sign: SignRule): boolean {
  switch (sign.strategy) {
    case "signed-column":
      return sign.amountColumn !== "";
    case "direction-column":
      return sign.amountColumn !== "" && sign.directionColumn !== "" && sign.debitValue !== "";
    case "debit-credit-columns":
      return sign.debitColumn !== "" && sign.creditColumn !== "";
  }
}

/**
 * The draft as something a **Parser** can apply — or `null` while it would still
 * have to guess at one of its answers.
 *
 * This is what makes the mapping step's preview the real thing: the rows under
 * the form are read by `applyFormat` through this, the same function and the
 * same record the commit will use, rather than by a preview-shaped imitation of
 * it that could disagree.
 *
 * The **name is not required here**. A user finds out whether a format is worth
 * naming by watching it parse, so the preview runs before the name does;
 * {@link draftComplete} is where the name becomes required, because that is
 * about *saving*.
 *
 * A half-answered filter — a column with no value — is folded to no filter at
 * all rather than to `equals: ""`, which would keep only the rows whose column
 * is empty and read as the format dropping the whole file.
 */
export function draftRules(draft: FormatDraft): FormatToApply | null {
  const { mapping, sign, dateOrder, decimalSeparator, filter } = draft;
  // The label is required and a list: no column named is the unanswered
  // question, and a format that reads none produces rows with no identity.
  if (mapping.date === "" || mapping.rawIssuerString.length === 0) return null;
  if (!signAnswered(sign)) return null;
  if (dateOrder === null || decimalSeparator === null) return null;

  return {
    kind: "csv",
    mapping,
    rules: {
      sign,
      dateOrder,
      decimalSeparator,
      filter: filter !== null && filter.column !== "" && filter.equals !== "" ? filter : null,
    },
  };
}

/**
 * Whether the draft is ready to be **saved** with the import: everything
 * {@link draftRules} needs, plus a name.
 *
 * The name is required (PRD #180) — a user who authors two formats for one bank
 * has to be able to tell them apart, and a list of untitled records is not a
 * list. Blank-but-typed counts as no name, so a space bar is not a name either.
 */
export function draftComplete(draft: FormatDraft): boolean {
  return draft.name.trim() !== "" && draftRules(draft) !== null;
}

/**
 * The draft as the create payload the commit sends — or `null` while it is not
 * ready to be saved.
 *
 * `headers` is the **whole header row of the file it was built from**, not the
 * subset the mapping happens to read. The fingerprint's job is to recognise
 * *this bank's export* on a later import, and a format that fingerprinted only
 * its mapped columns would answer to any file that happened to carry a `Date`
 * and a `Montant`. It is also what makes a bank adding a column produce a
 * strictly more specific new format, which is what most-specific-wins detection
 * is built on (PRD #180).
 */
export function draftCreate(
  draft: FormatDraft,
  accountId: AccountId,
  headers: readonly string[],
): StatementFormatCreate | null {
  const applied = draftRules(draft);
  const name = draft.name.trim();
  if (applied === null || name === "") return null;

  return {
    kind: "csv",
    accountId,
    name,
    headers,
    mapping: applied.mapping,
    rules: applied.rules,
  };
}
