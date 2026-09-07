import type { ParsedTransaction } from "./parsers/types";
import { readableAmount, readableDate } from "./readable-cell";

/** How many parsed rows the live preview shows before it stops listing them. */
const PREVIEW_ROWS = 10;

/**
 * The file's real rows, read through the draft as it stands.
 *
 * The raw rows in the pane opposite say what the bank wrote; these say what the
 * draft reads of it, and a wrong date order or decimal separator is only ever
 * visible in the second (PRD #208) — `03/04/2026` is a real date under either
 * order, and `1 929,71` a real number under either separator.
 *
 * A row the rules cannot read is shown as unreadable rather than as a plausible
 * wrong value — an Invalid Date has no rendering, and hiding the row would hide
 * the very thing the user is here to notice.
 */
export function DraftPreview({
  records,
  rowCount,
}: {
  /** The file's rows read through the draft — empty while it cannot read them. */
  records: readonly ParsedTransaction[];
  /** How many rows the file holds, against which the filter's effect is read. */
  rowCount: number;
}) {
  const shown = records.slice(0, PREVIEW_ROWS);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gousse-muted">
        {records.length === rowCount
          ? `${rowCount} ${rowCount === 1 ? "row" : "rows"} will be imported.`
          : `${records.length} of ${rowCount} rows will be imported.`}
      </p>
      <div className="overflow-hidden rounded-2xl border border-gousse-line">
        <table className="w-full text-sm" aria-label="Preview of the parsed rows">
          <thead className="bg-gousse-panel text-gousse-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Raw issuer</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Nothing here has an identity yet — the rows are re-read from
                scratch on every keystroke and none of them is a candidate for
                anything — so the position is the key. */}
            {shown.map((record, index) => (
              <tr key={index} className="border-gousse-line border-t">
                <td className="px-3 py-2 tabular-nums text-gousse-ink">
                  {readableDate(record.date)}
                </td>
                <td className="px-3 py-2 text-gousse-ink">{record.rawIssuerString}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    record.amount < 0 ? "text-gousse-high" : "text-gousse-low"
                  }`}
                >
                  {readableAmount(record.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {records.length > shown.length ? (
        <p className="text-xs text-gousse-muted">
          Showing the first {shown.length} of {records.length} rows.
        </p>
      ) : null}
    </div>
  );
}
