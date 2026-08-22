import type { IssuerId } from "@mamen/shared/contract";
import { ruleQueries } from "@/lib/sdk";

/**
 * How many of one issuer's **Matching Rules** a read asks for.
 *
 * An issuer's rule set is small by construction — it is the handful of patterns
 * a person wrote to recognise one merchant — so this is a bound on a
 * pathological issuer, not a page size anyone reaches. It is wide rather than
 * absent because there is no unpaged list endpoint; `Pagination` defaults every
 * list to `PaginationDefaults`' 50, which is close enough to a plausible
 * rule set to be crossed (issue #198).
 */
export const ISSUER_RULES_SCAN_LIMIT = 1000;

/**
 * The issuer detail page's read of its rules — **the whole set, in one query**.
 *
 * Both readers go through here because they must ask the identical question:
 * the Rules tab's badge counts them and the coverage bar sums their owned rows,
 * and two call sites spelling the window differently are two query keys, so the
 * same rules would be fetched twice and could disagree on screen.
 *
 * Whole-set, not a page, because both readers **aggregate**: a page-sized read
 * is a bug with a cliff at the page size, the same shape as the issuer-table
 * reads issue #62 retired. Past the cliff the badge undercounts and the coverage
 * bar reports the rules it never saw as hand-assigned rows. The envelope's
 * `total` is what lets a caller tell a complete read from a capped one, so the
 * cliff is at least *sayable* from the page rather than silent.
 */
export function issuerRulesQuery(issuerId: IssuerId) {
  return ruleQueries.list({ issuerId, limit: ISSUER_RULES_SCAN_LIMIT });
}
