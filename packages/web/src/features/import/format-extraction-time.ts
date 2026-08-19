/**
 * Human-readable extraction duration — sub-second in `ms`, otherwise `s`.
 *
 * Shared by the two steps that surface it: the upload step (which only holds
 * long enough to show it when no account was picked yet) and the PDF validation
 * step (where the user actually lands and lingers).
 */
export function formatExtractionTime(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
