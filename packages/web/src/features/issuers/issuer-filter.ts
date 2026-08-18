import type { IssuerMetrics } from "./issuer-sort";

/**
 * Narrow the issuers table to those whose name matches the filter box's text.
 *
 * The whole issuer list is already in memory (the view fetches it in one page to
 * derive count/value), so filtering is a client-side pass rather than a server
 * round-trip — typing re-renders without a refetch. The match is a
 * case-insensitive, accent-insensitive substring on the name only: the other
 * columns are numbers, and matching digits against a text box would surface
 * rows for reasons the user can't see.
 *
 * A blank or whitespace-only term matches everything, so clearing the box
 * restores the full table. The input is not mutated.
 */
export function filterIssuers(metrics: readonly IssuerMetrics[], query: string): IssuerMetrics[] {
  const needle = foldForSearch(query);
  if (needle === "") return [...metrics];
  return metrics.filter((m) => foldForSearch(m.issuer.name).includes(needle));
}

/**
 * Normalize a string for comparison: trimmed, lowercased, and stripped of
 * combining marks, so `creche` finds "Crèche" and vice versa. `NFD` splits an
 * accented character into base + mark; the range erases the marks.
 */
function foldForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
