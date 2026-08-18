import type { Issuer } from "@mamen/shared/contract";

/**
 * The three ways the issuers grid can be ordered (issue #41):
 * - `name` — alphabetical by issuer name (the default).
 * - `count` — by number of transactions.
 * - `value` — by total money moved, the sum of the transactions' *absolute*
 *   amounts (distinct from the signed net € the card shows, so an issuer with
 *   equal debits and credits still ranks by its activity).
 */
export type IssuerSortKey = "name" | "count" | "value";

/** Ascending or descending; every sort key supports both (issue #41). */
export type SortDirection = "asc" | "desc";

export type IssuerSort = {
  key: IssuerSortKey;
  direction: SortDirection;
};

/** The grid loads alphabetical, A→Z, matching the server's `orderBy=name`. */
export const DEFAULT_ISSUER_SORT: IssuerSort = {
  key: "name",
  direction: "asc",
};

/**
 * The direction a key starts in when first selected: names read A→Z, but the
 * count/value keys open high→low so the busiest / biggest issuers surface first
 * (issue #41). Re-selecting the active key toggles from here.
 */
export const DEFAULT_DIRECTION: Record<IssuerSortKey, SortDirection> = {
  name: "asc",
  count: "desc",
  value: "desc",
};

/**
 * The sort produced by clicking a key's control (issue #41): selecting a new key
 * adopts that key's default direction; clicking the already-active key flips it.
 */
export function nextIssuerSort(current: IssuerSort, key: IssuerSortKey): IssuerSort {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { key, direction: DEFAULT_DIRECTION[key] };
}

/**
 * The per-issuer metrics the count/value sorts rank by, derived client-side
 * from each issuer's transactions (the contract has no per-issuer aggregate).
 * `net` is unused by the sort but travels alongside so callers derive it once.
 */
export type IssuerMetrics = {
  issuer: Issuer;
  /** Total number of transactions for the issuer. */
  count: number;
  /** Signed net flow (debits negative) — what the card displays. */
  net: number;
  /** Total money moved: the sum of the transactions' absolute amounts. */
  value: number;
};

/** The `amount` field the metrics read — the only part of a transaction they need. */
export type AmountBearing = { amount: number };

/**
 * Derive an issuer's ranking metrics from its transactions (issue #41). `count`
 * comes from the server total (the scanned page may be capped); `net` sums the
 * signed amounts (what the card shows), `value` sums their absolute magnitudes
 * (total money moved, what the value sort ranks by). Kept beside the sort so the
 * derivation is unit-testable rather than buried in the view's render.
 */
export function issuerMetrics(
  issuer: Issuer,
  transactions: readonly AmountBearing[],
  count: number,
): IssuerMetrics {
  return {
    issuer,
    count,
    net: transactions.reduce((sum, txn) => sum + txn.amount, 0),
    value: transactions.reduce((sum, txn) => sum + Math.abs(txn.amount), 0),
  };
}

/** The A→Z tiebreaker every key falls back to — locale-aware, case-insensitive. */
const byName = (a: IssuerMetrics, b: IssuerMetrics) =>
  a.issuer.name.localeCompare(b.issuer.name, undefined, {
    sensitivity: "base",
  });

/**
 * Order issuers by the chosen key + direction (issue #41). Returns a new array;
 * the input is not mutated. Alphabetical uses a locale-aware, case-insensitive
 * compare; the numeric keys break ties by name (A→Z) so the order is stable and
 * doesn't jitter between equal-count / equal-value issuers.
 */
export function sortIssuers(metrics: readonly IssuerMetrics[], sort: IssuerSort): IssuerMetrics[] {
  const sign = sort.direction === "desc" ? -1 : 1;

  // Direction flips only the primary key; the name tiebreaker stays A→Z so
  // equal-count / equal-value issuers keep a stable, readable order either way.
  const compare = (a: IssuerMetrics, b: IssuerMetrics): number => {
    switch (sort.key) {
      case "name":
        return sign * byName(a, b);
      case "count":
        return sign * (a.count - b.count) || byName(a, b);
      case "value":
        return sign * (a.value - b.value) || byName(a, b);
    }
  };

  return [...metrics].sort(compare);
}
