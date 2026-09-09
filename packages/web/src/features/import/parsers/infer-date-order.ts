import type { DateOrder } from "@mamen/shared/contract";

/**
 * What a column of date values proves about the order its bank writes them in
 * — or that it proves nothing.
 *
 * Two arms rather than a nullable {@link DateOrder}, because "the sample settles
 * it" and "the sample is genuinely ambiguous" are different facts about the
 * file and the caller acts differently on each. `01/02/2026` down the whole
 * column is not weak evidence for day-first, it is *no* evidence: the file is
 * consistent with both readings and a bank writing either would produce exactly
 * these characters. PRD #180's refusal to guess stands — what changes is that a
 * column of `23/04/2026` is not a guess, it is a reading.
 */
export type DateOrderInference =
  | { readonly outcome: "inferred"; readonly order: DateOrder }
  | { readonly outcome: "ambiguous" };

/** `YYYY-MM-DD`, optionally carrying a time — the ISO the parser hands to `Date`. */
const ISO_LEADING_YEAR = /^\d{4}\D\d{1,2}\D\d{1,2}(?:[T\s].*)?$/;

/**
 * Two parts then a four-digit year — the shape the two ambiguous orders share,
 * and the only shape a positional reading applies to.
 *
 * Deliberately the same regex the parser reads these values with
 * (`TWO_TWO_FOUR` in `apply-format`): a value this cannot match is one the
 * declared order could not read either, so inferring from it would be inferring
 * from a value the format is going to fail on anyway.
 */
const TWO_TWO_FOUR = /^(\d{1,2})\D(\d{1,2})\D(\d{4})$/;

/**
 * How many values must be readable before the sample is allowed to conclude
 * anything at all.
 *
 * One is enough. The discriminating evidence here is a single part exceeding
 * twelve, which is proof rather than a tally — a `23` in the first position
 * cannot be a month under any calendar — so requiring a quorum would only
 * refuse files whose one dated row happened to be unambiguous.
 */
const MIN_READABLE = 1;

/** Whether every non-blank value in the sample is an ISO date. */
function allIso(values: readonly string[]): boolean {
  return values.every((value) => ISO_LEADING_YEAR.test(value));
}

/**
 * Infer which order a column of dates is written in, from the values themselves.
 *
 * Three things are read, in the order they are conclusive:
 *
 * 1. **A leading four-digit year** settles it outright — `2026-04-03` is ISO and
 *    nothing else, so a sample whose every value looks like that is `iso`.
 * 2. **A part above twelve proves the day's position.** `23/04/2026` has no
 *    reading in which `23` is a month, so that file is day-first; `04/23/2026`
 *    is month-first by the same argument. This is the whole of the
 *    disambiguation and it is evidence, not preference.
 * 3. **Everything else is ambiguous.** A column in which no value ever exceeds
 *    twelve in either position is one the file genuinely does not answer, and
 *    the honest result is to say so.
 *
 * The sample is read **whole, and it must agree**. One row saying day-first
 * while another says month-first is a column that is not dates at all, or a
 * mixed export — either way not something to conclude from, so contradictory
 * evidence yields `ambiguous` rather than letting the first row win. That is the
 * cross-check that keeps a single malformed row from deciding the format.
 *
 * Pure and value-only: it never sees the column's name. A header called `Date`
 * is not evidence about the order, and inferring from names is how a French
 * export gets read month-first because it said `Date`.
 */
export function inferDateOrder(values: readonly string[]): DateOrderInference {
  const present = values.map((value) => value.trim()).filter((value) => value !== "");
  if (present.length === 0) return { outcome: "ambiguous" };

  // Asked first: an ISO value is unambiguous on its own, and its year would
  // otherwise fall through to a positional reading that cannot match it.
  if (allIso(present)) return { outcome: "inferred", order: "iso" };

  let dayFirst = false;
  let monthFirst = false;
  let readable = 0;

  for (const value of present) {
    const match = TWO_TWO_FOUR.exec(value);
    if (!match) continue;
    readable += 1;

    const first = Number(match[1]);
    const second = Number(match[2]);
    // Above twelve is the proof; twelve and under says nothing either way, and
    // a zero is a malformed part that proves nothing about position.
    if (first > 12 && first <= 31) dayFirst = true;
    if (second > 12 && second <= 31) monthFirst = true;
  }

  if (readable < MIN_READABLE) return { outcome: "ambiguous" };
  // Both, or neither. Both is a column contradicting itself; neither is the
  // `01/02/2026` case, where the file simply has not said.
  if (dayFirst === monthFirst) return { outcome: "ambiguous" };
  return { outcome: "inferred", order: dayFirst ? "day-first" : "month-first" };
}
