import { normalizeIban } from "@mamen/shared/contract";

/**
 * IBAN display and shape-checking, kept in one module so the create dialog, the
 * edit form and the card all agree on what is stored versus what is shown.
 *
 * The **stored form** itself is not decided here any more (issue #201): it is
 * the contract's, and `normalizeIban` is re-exported from there so this module
 * still reads as the one place the app's IBAN rules live. What moved is the
 * enforcement — the schema normalises every value crossing the wire, in both
 * directions, so a client that forgets to call {@link ibanPayload} can no longer
 * store a grouped account number the way any non-web caller used to.
 *
 * The rule is deliberately loose. An IBAN is at most 34 alphanumeric characters
 * starting with a two-letter country code, and the per-country lengths and the
 * mod-97 checksum are both knowable — but validating either here would mean the
 * app refusing a real account number it simply does not have the table for, and
 * the IBAN is reference data the user reads back, never a key the app computes
 * with. So the field checks the shape and nothing else: anything that could be
 * an IBAN is accepted, and the user's own statement is the authority on whether
 * it is the right one.
 */

/** Longest IBAN any country issues (Malta, Saint Lucia). */
const MAX_LENGTH = 34;

/** Shortest IBAN any country issues (Norway). */
const MIN_LENGTH = 15;

/** Two-letter country code, two check digits, then 11–30 alphanumerics. */
const IBAN_SHAPE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

/**
 * The stored form: upper-case, with every space and separator stripped. Users
 * copy IBANs out of statements and banking apps, which group them in fours and
 * sometimes hyphenate them, so the same account typed twice would otherwise be
 * two different strings.
 *
 * Defined in the contract (`StoredIban`) and re-exported here: the schema and
 * this module have to mean the same thing by "normalised", and two copies of one
 * regex is how they would stop.
 */
export { normalizeIban };

/**
 * The displayed form: groups of four, as every bank prints it. A 34-character
 * run of characters is unreadable and, worse, uncheckable — the grouping is what
 * lets someone compare it against a statement without losing their place.
 */
export function formatIban(iban: string): string {
  return normalizeIban(iban)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/**
 * Whether a *normalised* value could be an IBAN. Empty is valid: the field is
 * optional, and an empty one is "not given" rather than a failed entry — which
 * is what lets the same predicate guard both an untouched form and a cleared
 * one.
 */
export function isPlausibleIban(iban: string): boolean {
  if (iban.length === 0) return true;
  return iban.length >= MIN_LENGTH && iban.length <= MAX_LENGTH && IBAN_SHAPE.test(iban);
}

/**
 * What to send for a submitted field: a normalised IBAN, or `null` when the
 * field was left empty. `null` is meaningful on the wire (it *clears* a stored
 * IBAN), so this never returns `undefined` — an edit that empties the field must
 * be able to say so.
 */
export function ibanPayload(input: string): string | null {
  const normalized = normalizeIban(input);
  return normalized.length === 0 ? null : normalized;
}
