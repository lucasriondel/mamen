import type { DecimalSeparator } from "@mamen/shared/contract";

/**
 * What a column of amounts proves about the mark its bank puts before the
 * decimals — or that it proves nothing.
 *
 * Two arms for the same reason {@link DateOrderInference} has two: `1234` down
 * the whole column, or `1,234` on its own, is a file that has not said. The
 * second of those is the trap this module exists for — `1,234` is a thousands
 * comma in an American export and one thousand two hundred and thirty-four
 * *thousandths* nowhere, but it is also `1,23` with an extra digit, and only the
 * rest of the sample can tell them apart.
 */
export type DecimalSeparatorInference =
  | { readonly outcome: "inferred"; readonly separator: DecimalSeparator }
  | { readonly outcome: "ambiguous" };

/**
 * Everything that is never either mark: the thousands separators
 * `apply-format` already strips (space, non-breaking space, apostrophe), plus
 * the sign and currency furniture a bank prints around a number.
 *
 * Stripped before anything is counted so that `1 234,56` and `1234,56` are one
 * case rather than two, and `-12,50 €` is read as the number it is.
 */
const NOT_A_SEPARATOR = /[^\d.,]/g;

/** A number that ends in a separator followed by exactly two digits. */
const TRAILING_TWO = /[.,]\d{2}$/;

/** A number that ends in a separator followed by exactly three digits. */
const TRAILING_THREE = /[.,]\d{3}$/;

/**
 * What one value, read alone, says about the separator — `null` when it says
 * nothing.
 *
 * The rules, in the order they are conclusive:
 *
 * - **Both marks present.** The *last* one is the decimal mark and the other is
 *   thousands, which settles `1,234.56` (dot) and `1.234,56` (comma) outright.
 *   This is the only case that needs no corroboration.
 * - **One mark, more than once.** `1.234.567` cannot be a decimal mark used
 *   three times, so that mark is thousands and the *other* is the decimal one.
 * - **One mark, once, with exactly two digits after it.** The
 *   last-separator-with-two-trailing-digits heuristic: `1234,56` is a decimal
 *   comma. Weak on its own — `1,23` is also what a three-digit thousands group
 *   would look like if banks wrote them in twos, which they do not — and it is
 *   the workhorse.
 * - **One mark, once, with exactly three digits after it.** `1,234` — almost
 *   certainly a thousands group, so it is evidence for the *other* mark, but
 *   weak: a bank writing thousandths would produce the same characters.
 * - Anything else — no mark at all, or a run of digits after it that is neither
 *   two nor three — says nothing.
 */
function readValue(value: string): DecimalSeparator | null {
  const dot = value.includes(".");
  const comma = value.includes(",");
  if (!dot && !comma) return null;

  if (dot && comma) {
    // The last mark separates the decimals; the earlier one groups thousands.
    return value.lastIndexOf(".") > value.lastIndexOf(",") ? "dot" : "comma";
  }

  const mark = dot ? "." : ",";
  const other: DecimalSeparator = dot ? "comma" : "dot";
  const self: DecimalSeparator = dot ? "dot" : "comma";
  const occurrences = value.split(mark).length - 1;

  // Repeated, so grouping — which is evidence for the mark that is *not* here.
  if (occurrences > 1) return other;
  if (TRAILING_TWO.test(value)) return self;
  if (TRAILING_THREE.test(value)) return other;
  return null;
}

/**
 * Infer which mark separates the decimals in a column of amounts, from the
 * values themselves.
 *
 * Every value is read on its own by {@link readValue}, and then the sample is
 * **cross-checked as a whole**: one row is never enough here, because the
 * single most misleading value in banking data — `1,234` — reads one way alone
 * and the opposite way beside `1,234.56`. So the votes are tallied and a
 * unanimous verdict is required. A sample where some rows say dot and others say
 * comma is a column mixing conventions or not amounts at all; either way it is
 * `ambiguous` rather than a majority-rules guess that would be silently wrong on
 * the rows it outvoted.
 *
 * A column of bare integers (`1234`, `-50`) votes nothing at all and is
 * `ambiguous` — correctly: a bank writing whole euros has not said which mark it
 * would use, and either choice parses those values identically anyway.
 *
 * Pure and value-only, and it never sees the column's name, for the reason
 * {@link inferDateOrder} does not either.
 */
export function inferDecimalSeparator(values: readonly string[]): DecimalSeparatorInference {
  const votes = new Set<DecimalSeparator>();

  for (const raw of values) {
    const value = raw.replace(NOT_A_SEPARATOR, "");
    if (value === "") continue;
    const vote = readValue(value);
    if (vote !== null) votes.add(vote);
  }

  // Nothing said, or the sample contradicting itself. Both are the file failing
  // to answer, and neither is somewhere to guess from.
  if (votes.size !== 1) return { outcome: "ambiguous" };
  const [separator] = [...votes];
  return { outcome: "inferred", separator };
}
