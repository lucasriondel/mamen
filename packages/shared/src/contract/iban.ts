import { Schema } from "effect";

/**
 * The **stored form** of an IBAN, as a schema rather than as a convention
 * (issue #201).
 *
 * `accounts.iban` has been documented as "stored normalised (upper-case, no
 * spaces)" since it was added, and `transactions.counterpartyIban` says the same
 * thing and gives the reason: the two exist to be *joined*, and a bank that
 * prints its account numbers in groups of four would otherwise fail that join.
 * But the only thing that made either true was the web client remembering to
 * call its own `ibanPayload` before every write. Any other caller — a curl, an
 * SDK script, a future importer — stored `fr76 1234…` verbatim, and every
 * exact-match consumer then silently missed it: the transfer view's
 * **IBAN-confirmed** mark compares the two columns in SQL, on the bytes as
 * stored, and the accounts card's no-op check compares a form against them.
 *
 * So the invariant moves into the contract, where every client and the server
 * already meet. Two decisions make that work:
 *
 * - **Normalise, never refuse.** A transform, not a filter: `FR76 1234` is a
 *   perfectly real account number written the way every bank prints it, and a
 *   400 would be the contract punishing a caller for its formatting. Converging
 *   is what was asked for; rejecting is a different thing that happens to end
 *   the mismatch.
 * - **In both directions.** Decode is the server reading a request body (and
 *   any client reading a response); encode is a client writing one. A transform
 *   that only normalised on decode would leave the SDK's derived HTTP client
 *   sending whatever it was handed, so both halves do the same thing. The
 *   function is idempotent, which is what makes that safe: a round-trip through
 *   the wire cannot drift.
 *
 * Shape is deliberately *not* checked here. An IBAN's per-country length and its
 * mod-97 checksum are both knowable, and this app knows neither on purpose — it
 * would mean refusing a real account number it simply has no table for. What is
 * stored is the user's business; how it is *spelled* is the contract's.
 *
 * Only `accounts.iban` is guarded so far — that is the field issue #201 names.
 * `transactions.counterpartyIban` is the other end of the same join and is
 * normalised at the import edge, by the browser parser that is its only writer;
 * moving it here is the same one-line change, on the day a second writer exists.
 */

/**
 * The stored spelling: upper-case, with every space and separator stripped.
 * Users copy IBANs out of statements and banking apps, which group them in
 * fours and sometimes hyphenate them, so the same account typed twice would
 * otherwise be two different strings.
 *
 * Idempotent — `normalizeIban(normalizeIban(x)) === normalizeIban(x)` — which is
 * what lets {@link StoredIban} apply it on both sides of the wire.
 */
export function normalizeIban(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * The canonical value of a nullable IBAN field: the normalised string, or
 * `null` when there is nothing to store.
 *
 * A blank folds to `null` rather than to `""` because "not given" gets one
 * spelling — the same rule `counterpartyIban` states as *absent, never an empty
 * string*. Two spellings of nothing is exactly what breaks a no-op check: an
 * untouched form holding `null` beside a stored `""` reads as an edit and
 * issues a write nobody asked for.
 */
const storedForm = (value: string | null): string | null => {
  const normalized = normalizeIban(value ?? "");
  return normalized.length === 0 ? null : normalized;
};

/**
 * A stored IBAN, or `null` for an account with none on file. Both directions
 * run {@link storedForm}, so no boundary this schema guards can carry an
 * un-normalised account number in either direction.
 */
export const StoredIban = Schema.transform(
  Schema.NullOr(Schema.String),
  Schema.NullOr(Schema.String),
  { strict: true, decode: storedForm, encode: storedForm },
);
