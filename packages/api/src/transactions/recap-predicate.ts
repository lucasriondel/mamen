import type { SqlClient } from "@effect/sql";
import type { Fragment } from "@effect/sql/Statement";

/**
 * The recap's SQL fragments, all built over the `t` (transactions) alias and the
 * `i` (issuers) LEFT JOIN the read projection already carries.
 */
export interface RecapPredicates {
  readonly recapExclusion: Fragment;
  readonly isTransferLeg: Fragment;
  readonly isNotBundleMemberFor: (alias: string) => Fragment;
  readonly isNotBundleMember: Fragment;
  readonly isRecapExcluded: Fragment;
  readonly countsTowardRecap: Fragment;
}

/**
 * **Which rows count toward the recap** — the one definition of it, in a module
 * of its own (issue #80) rather than inside the repository's service closure, so
 * a test can run the predicate *alone*, against rows, without the list's WHERE
 * around it. That is the whole point: a rule that is only ever exercised through
 * `buildConditions` is pinned by whatever `buildConditions` happens to do, not by
 * what the predicate says.
 *
 * Requires the `transactions t LEFT JOIN issuers i ON t.issuerId = i.id` shape in
 * scope: `recapExclusion` reads the issuer's default through the join.
 */
export const recapPredicates = (sql: SqlClient.SqlClient): RecapPredicates => {
  // **Excluded from recap** (issues #67/#69, ADR 0008), defined ONCE beside the
  // expression it mirrors and reused by the read projection AND the filter, so
  // the two can never disagree — the ADR 0002 drift, on a second field. Same
  // shape as the derived category, over the same `issuers` LEFT JOIN: a row the
  // user decided about (`manualExcluded`) keeps its own stored flag, any other
  // row inherits its issuer's default. So a transaction imported under an
  // excluded issuer is excluded the moment it lands — nothing to re-run — and
  // un-excluding an issuer cannot clobber a deliberate per-row decision in
  // either direction.
  //
  // `COALESCE(i.excludedFromRecap, 0)` is where the LEFT JOIN's `NULL` lands: a
  // row with no issuer (or an issuer predating migration 0019) has nothing to
  // inherit, so it *counts*. Without it the read would decode a `NULL` into a
  // non-nullable column and `WHERE … = 0` would drop every issuer-less row from
  // the "counted only" view — neither side of the filter would list it.
  const recapExclusion = sql`CASE WHEN t.manualExcluded = 1 THEN t.excludedFromRecap ELSE COALESCE(i.excludedFromRecap, 0) END`;

  const isTransferLeg = sql`t.transferGroupId IS NOT NULL`;

  // The **bundle-membership** rule (issue #68), stated once here and read by
  // `countsTowardRecap` below, `buildConditions`' list default and the
  // transfer-eligibility predicate — one fragment, three readers, so the
  // recap, the list and the transfer flows cannot come to mean different
  // things by "this row stands for itself".
  //
  // Alias-parameterised (issue #174) because the transfer queries self-join
  // transactions as `c` and `f`: the reader that could not say `t` was the one
  // that had hand-copied the rule. `isNotBundleMember` below is this generator
  // under the stored alias, so every existing reader is untouched.
  //
  // Written in the positive (`IS NULL`) rather than as `NOT (… IS NOT NULL)`
  // because it is an indexable constraint in that form: `idx_tx_bundleId`
  // exists for exactly this read (migration 0020), which is on the hot path of
  // every unfiltered list.
  const isNotBundleMemberFor = (alias: string) => sql`${sql.literal(alias)}.bundleId IS NULL`;

  const isNotBundleMember = isNotBundleMemberFor("t");

  const isRecapExcluded = sql`(${recapExclusion} = 1 OR t.isDuplicateExcluded = 1)`;

  // **Counts toward recap** (issue #71) — the ONE definition of what the spend
  // summary is computed over, built from the fragments above rather than
  // restating any part of them. A row counts unless it is:
  //
  // - a **transfer group** leg — money moving between the user's own accounts,
  //   not spending. Summarised separately (`recapTransfersQuery`) because there
  //   IS a counterpart and the movement is worth a line.
  // - **excluded from recap** — by its own flag or through its issuer.
  // - **duplicate-excluded** — the same money already counted on another row, so
  //   counting it again would overstate the period.
  // - a **bundle member** — its **bundle parent** already stands for it, so
  //   counting both would show the same money twice (issue #68).
  //
  // A **bundle parent** is deliberately not named: it carries no `bundleId`, so
  // it is an ordinary row to every clause here (issue #76). It counts once, for
  // its summed amount, under the issuer and category the user curated onto it,
  // and follows the caller's sign rule with no special case — a bundle that sums
  // to a credit is income and reaches no spend bucket, exactly as any credit
  // does. That such a bundle is probably a mis-bundling is said with an anomaly
  // flag on the parent (`bundleAnomalyFlags`), never by bending the arithmetic.
  //
  // The member clause was implicit until issue #80: the recap inherited it from
  // `buildConditions`' default and the totals were right, but the predicate
  // documented everywhere as the single source of truth for recap inclusion
  // never mentioned bundles — so the rule held by accident of composition
  // rather than by statement, and a caller composing the predicate without that
  // default would have double-counted with nothing to warn it.
  //
  // Every clause reads a column that is never NULL (`recapExclusion` COALESCEs
  // the LEFT JOIN's away), so `NOT (…)` cannot swallow a row.
  const countsTowardRecap = sql`(NOT ${isTransferLeg} AND NOT ${isRecapExcluded} AND ${isNotBundleMember})`;

  return {
    recapExclusion,
    isTransferLeg,
    isNotBundleMemberFor,
    isNotBundleMember,
    isRecapExcluded,
    countsTowardRecap,
  };
};
