import type {
  Category,
  Issuer,
  RecapExcluded,
  RecapSummary,
  RecapTransfers,
} from "@mamen/shared/contract";
import { resolveCategoryColors } from "@/lib/category-tree";

/**
 * One row of a recap spend section (issue #35): a named bucket — an issuer or a
 * category — with the total money spent against it over the active period.
 *
 * `spent` is a **positive** magnitude of expenses, so the sections rank naturally
 * high→low and read as "money out". `count` is how many spending transactions
 * fell in the bucket, shown alongside the total. Both are computed server-side
 * (issue #71); what this module adds is the bucket's visual identity.
 */
export type SpendRow = {
  /** Stable key for React lists and sort tiebreaks — the entity id, or `null`. */
  id: number | null;
  /** The bucket's display name (the issuer/category name, or an "Unassigned" label). */
  name: string;
  /** Total money spent in the bucket — a positive magnitude in euros. */
  spent: number;
  /** How many spending transactions fell in the bucket. */
  count: number;
  /** Issuer image URL (root-relative `/uploads/issuers/…`), for the by-issuer section. */
  imageUrl?: string;
  /**
   * The issuer's **issuer default category** id, for the by-issuer section — the
   * second rung of the **Avatar fallback chain** (issue #59). Carried as an *id*
   * rather than a resolved icon/colour pair, unlike the category rows below: the
   * avatar owns that resolution, so handing it a pre-resolved pair would put a
   * second copy of the chain here.
   */
  defaultCategoryId?: number;
  /** The category's **Icon name** (a Lucide id), for the by-category section. */
  icon?: string;
  /**
   * The category's **Resolved colour** — resolved here, where the whole tree is
   * in hand, because `color` may be null and mean *inherit* (ADR 0006). Carried
   * on the row so the section renders a colour it is handed rather than
   * re-deriving one from a lookup it does not have.
   */
  color?: string;
};

/**
 * The internal-transfer movement excluded from the spend breakdowns (PRD #48).
 * `total` is the money that moved between the user's own accounts — the sum of
 * the magnitudes of the **debit** legs — so a clean -30/+30 pair reads as 30, not
 * a net ~0 nor a doubled 60. `count` is how many transfer legs fell in the period.
 */
export type TransferSummary = RecapTransfers;

/** The two spend breakdowns the recap page shows, each already summed per bucket. */
export type RecapSpend = {
  byIssuer: SpendRow[];
  byCategory: SpendRow[];
  /** The internal-transfer legs netted out of the breakdowns, summarised. */
  transfers: TransferSummary;
  /** The spend held out of the breakdowns by an exclusion decision (issue #87). */
  excluded: ExcludedSummary;
};

/**
 * The spend **held out** of the breakdowns (issue #87) — `total` is the sum of the
 * excluded **debit** magnitudes, so the line reads as money out that is not in the
 * total above; `count` is every excluded row in the period.
 */
export type ExcludedSummary = RecapExcluded;

/** The label a spend row carries when a bucket has no issuer / category. */
export const UNASSIGNED_LABEL = "Unassigned";

/**
 * How the money **held out** of the recap is named (issue #87) — on the summary
 * line the recap shows it on, and as the heading of the detail page that lists it.
 * One constant, so the line the user clicks and the page they land on agree.
 */
export const EXCLUDED_LABEL = "Excluded from recap";

/**
 * Name the buckets the server summed (issue #71).
 *
 * The arithmetic — which rows count, what they add up to — lives entirely in the
 * API's `countsTowardRecap` predicate and its `GROUP BY`, so nothing here filters
 * or sums: a second reducer over a page of rows is precisely what this slice
 * removed, because it was a second definition of "counts toward spend" that had
 * to be kept in sync with the SQL by hand.
 *
 * What is left is display identity, which the client owns because it is the
 * client that already resolves the issuers and categories it is showing (#62):
 * a bucket id becomes a name, an avatar, an icon and a **Resolved colour**. An
 * id with no lookup entry — and the `null` bucket the server reports for rows
 * with no issuer / no category — both fall back to {@link UNASSIGNED_LABEL}, so
 * unattributed spend is *named* rather than dropped.
 */
export function toSpendRows(
  summary: RecapSummary,
  lookups: {
    issuersById: ReadonlyMap<number, Issuer>;
    categoriesById: ReadonlyMap<number, Category>;
  },
): RecapSpend {
  const { issuersById, categoriesById } = lookups;

  const byIssuer = summary.byIssuer.map((bucket): SpendRow => {
    const issuer = bucket.id == null ? undefined : issuersById.get(bucket.id);
    return {
      id: bucket.id,
      name: issuer?.name ?? UNASSIGNED_LABEL,
      imageUrl: issuer?.imageUrl,
      defaultCategoryId: issuer?.defaultCategoryId,
      spent: bucket.spent,
      count: bucket.count,
    };
  });

  // The **Resolved colour** walk takes the whole tree, so resolve every category
  // once up front rather than re-walking it per bucket.
  const colorById = resolveCategoryColors([...categoriesById.values()]);
  const byCategory = summary.byCategory.map((bucket): SpendRow => {
    const category = bucket.id == null ? undefined : categoriesById.get(bucket.id);
    return {
      id: bucket.id,
      name: category?.name ?? UNASSIGNED_LABEL,
      icon: category?.icon,
      // Resolved against the whole tree, not read off the row: an inheriting
      // leaf's colour lives on an ancestor (ADR 0006).
      color: category === undefined ? undefined : colorById.get(category.id),
      spent: bucket.spent,
      count: bucket.count,
    };
  });

  return {
    byIssuer,
    byCategory,
    transfers: summary.transfers,
    excluded: summary.excluded,
  };
}
