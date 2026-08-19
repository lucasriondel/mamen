/**
 * Human-readable extraction duration — sub-second in `ms`, otherwise `s`.
 *
 * Shared by the two steps that surface it: the PDF validation step, where the
 * user lands and lingers, and the upload step, which since issue #181 shows it
 * only on the way back — an extraction now always lands on validation, so the
 * upload step sees an extracted file again only when the user hits Back.
 */
export function formatExtractionTime(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
