import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * The dropped CSV, exactly as it was delivered — its real header row and every
 * one of its rows (issue #211, PRD #208).
 *
 * The left pane of the import wizard's **split view**, opposite whatever the
 * user is working in: the import table on the preview step, and the format form
 * on the mapping step once #212 puts it there. It is a plain table of what the
 * file says — the bank's own words in the bank's own spelling (ADR 0012), which
 * is what lets a row be read against the line that produced it rather than
 * decided from the parsed output alone.
 *
 * Nothing is interpreted here. A cell is the string papaparse delivered, so the
 * ISO stamp the statement wrote is the ISO stamp on screen — the parsed reading
 * of it is the other pane's job, and the two being different is the point.
 *
 * **The whole file, never a sample.** A column whose first rows are blank or
 * uniform is exactly the one a first page cannot settle, so there is no cap: the
 * rows scroll instead, vertically *and* sideways, inside this pane. A bank that
 * writes twenty columns must not push the pane beside it off the page — which is
 * why the table is `w-max` over a scroller of its own rather than `w-full` over
 * cells that would wrap themselves narrow.
 *
 * Unvirtualized, deliberately (PRD #208): a statement of a few thousand rows
 * renders that many rows here. The import table beside it already does the same
 * for the same reason, so this is the existing trade extended to one more table.
 */
export function CsvFileTable({
  fileName,
  headers,
  rows,
}: {
  /** The dropped file's name — what the pane and its table are called. */
  fileName: string;
  /** The file's real header row, in the file's own order. */
  headers: readonly string[];
  /** Every row of it, keyed by header, as delivered. */
  rows: ReadonlyArray<Record<string, string>>;
}) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-gousse-line">
      {/* Outside the scroller, so the file being read stays named however far
          down its rows the user has gone. */}
      <p className="px-3 pt-3 text-sm text-gousse-muted">
        <span className="font-medium text-gousse-ink">{fileName}</span> — {rows.length}{" "}
        {rows.length === 1 ? "row" : "rows"}, as delivered
      </p>

      {/* One scroller for both axes, so the header can stay stuck to the top of
          it while the rows move under it in either direction. The `ui/table`
          shell is deliberately not used here: it wraps its `<table>` in an
          `overflow-x-auto` box of its own, which would be a second scroll
          context inside this one and would take the sticky header with it. Its
          row and cell primitives are, so the file reads in the same tokens as
          the table beside it. */}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Named for the file itself: two tables are on screen now, and which
            one this is *is* which file it shows. */}
        <table aria-label={fileName} className="w-max min-w-full text-sm">
          <TableHeader className="sticky top-0 bg-gousse-panel">
            <TableRow>
              {/* Keyed by position, not by name: two columns of a real export
                  can carry the same header, and a duplicate key is React's
                  problem where a duplicate column is the bank's. */}
              {headers.map((header, index) => (
                <TableHead key={index} className="whitespace-nowrap">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* The rows have no identity of their own here — nothing selects,
                edits or reorders them — so the position is the key. */}
            {rows.map((row, index) => (
              <TableRow key={index}>
                {headers.map((header, column) => (
                  <TableCell key={column} className="whitespace-nowrap text-gousse-muted">
                    {row[header] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
