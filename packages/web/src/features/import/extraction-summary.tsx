import { formatExtractionTime } from "./format-extraction-time";

/**
 * How many rows the model read, and how long it took.
 *
 * The count is of what was *extracted*, not what is on screen now — the user's
 * edits below change the table, not what the extraction returned. Which is why it
 * is handed the wizard's snapshot rather than the rows (issue #202):
 * `extracted.length` grows every time the user adds an operation the model missed,
 * so rendering it here had this line claim the extraction returned rows that were
 * typed in after it had finished.
 */
export function ExtractionSummary({
  extraction,
}: {
  extraction: { readonly rowCount: number; readonly ms: number };
}) {
  const { rowCount } = extraction;
  return (
    <p className="text-sm text-gousse-muted">
      <span className="font-medium text-gousse-ink">{rowCount}</span>{" "}
      {rowCount === 1 ? "transaction" : "transactions"} extracted in{" "}
      {formatExtractionTime(extraction.ms)}
    </p>
  );
}
