import type { AccountId, TransactionKind } from "@mamen/shared/contract";

/**
 * The fields a **duplicate check** compares, on either side of it. Both a
 * `ParsedTransaction` coming off a statement and a stored `Transaction`
 * structurally satisfy this, so the check reads one shape and never has to know
 * which side a row came from.
 */
export type DuplicateCandidate = {
  accountId: AccountId;
  date: Date;
  amount: number;
  rawIssuerString: string;
  /** Present on stored rows only; `"bundle"` marks a **bundle parent**. */
  kind?: TransactionKind;
};

/**
 * The one normalisation a duplicate check applies to the **raw issuer string**:
 * collapse runs of whitespace, trim, uppercase. Nothing further — no accent
 * folding, no punctuation stripping, no prefix or fuzzy matching.
 *
 * Every extra step widens what counts as "the same row", and the asymmetry runs
 * the other way (epic #85): a missed duplicate costs the user one delete, while
 * a wrongly flagged row risks them deleting a real transaction on the app's
 * say-so. Under a looser rule two reference numbers differing only where a PDF
 * extraction truncated one would collapse into each other.
 */
export function normaliseIssuerString(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * The identity a duplicate check compares on: account, date, amount and
 * normalised raw issuer string — all four exactly.
 *
 * The account is part of the key rather than merely part of the query scope: the
 * same transaction on a different account is not a duplicate, and stating that
 * here means no caller can widen it by fetching more broadly.
 *
 * The amount is compared in **integer cents**, following the money convention
 * the value matcher already uses (`round(amount·100)`): two floats that print
 * the same are the same amount, and a float `===` would call them different.
 */
export function duplicateKey(row: DuplicateCandidate): string {
  const cents = Math.round(row.amount * 100);
  return `${row.accountId}|${row.date.getTime()}|${cents}|${normaliseIssuerString(row.rawIssuerString)}`;
}

/**
 * Which parsed rows look **already imported** — one boolean per record, in
 * order. Advisory only: a flagged row still commits (nothing is auto-excluded,
 * epic #85), the mark exists so the user can decide.
 *
 * Matching is by **multiplicity**, not by set membership: one stored row
 * accounts for exactly one parsed row. Same-day / same-amount / same-issuer rows
 * are genuinely real — two identical coffees on one afternoon — so a statement
 * carrying two of them against one stored row flags one, not both.
 *
 * **Bundle parents** are skipped. A parent is a row the user made, standing for
 * its members: its amount is their sum and its raw issuer string the label typed
 * for it, so a statement row that matched one would be matching an aggregate
 * rather than a bank row.
 */
export function flagDuplicates(
  records: readonly DuplicateCandidate[],
  existing: readonly DuplicateCandidate[],
): boolean[] {
  const unclaimed = new Map<string, number>();
  for (const row of existing) {
    if (row.kind === "bundle") continue;
    const key = duplicateKey(row);
    unclaimed.set(key, (unclaimed.get(key) ?? 0) + 1);
  }

  return records.map((record) => {
    const key = duplicateKey(record);
    const left = unclaimed.get(key) ?? 0;
    if (left === 0) return false;
    unclaimed.set(key, left - 1);
    return true;
  });
}
