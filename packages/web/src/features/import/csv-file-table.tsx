import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ColumnMarks } from "./column-marks";
import { ROW_HIGHLIGHT_TINT, type RowHighlight } from "./row-highlight";
import type { RowId } from "./wizard-reducer";

/**
 * How a column of the file is marked: `mapped` for one the draft reads, `active`
 * for the one the field the user is currently in points at, and nothing at all
 * for a column nobody has mapped.
 *
 * A named contract rather than a class name (PRD #208). The tint itself is
 * styling — jsdom lays out none of it — so `data-column-mark` is what says, of
 * every cell of the column and of its header, which of the three it is in.
 */
type ColumnMark = "active" | "mapped" | undefined;

/** The bank's own word for a column, and what the draft reads it as. */
function HeaderName({ header, labels }: { header: string; labels: readonly string[] }) {
  return (
    <span className="inline-flex items-center gap-2">
      {header}
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full bg-gousse-accent/10 px-2 py-0.5 font-medium text-gousse-accent text-xs"
        >
          {label}
        </span>
      ))}
    </span>
  );
}

function columnMark(mapped: boolean, active: boolean): ColumnMark {
  if (!mapped) return undefined;
  return active ? "active" : "mapped";
}

/** The tint that goes with it: stronger for the column being answered about. */
function columnTint(mark: ColumnMark): string | false {
  if (mark === undefined) return false;
  return mark === "active" ? "bg-gousse-accent/15" : "bg-gousse-accent/[0.06]";
}

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
 *
 * **The mapping is drawn over it while one is being built** (issue #213): a
 * column the draft reads carries a badge naming what it feeds and is tinted,
 * more strongly for the field the user is currently in. The marks are handed in
 * derived from the draft, so this table holds no copy of the mapping and cannot
 * disagree with the form beside it. On the preview step nothing is being mapped
 * and none are passed, so the file reads exactly as it did before.
 *
 * **And paired with the parsed rows beside it** (issue #215): where the caller
 * hands over the rows' **stable row ids** and the pairing, every line declares
 * its identity and lights up with the record it produced. The join is the id,
 * never the position — a line the format's filter dropped is on screen here and
 * absent there, and lights nothing. A caller that hands over neither (the
 * mapping step, whose right pane is a form) declares no identities at all.
 *
 * **And answered from it, in pick mode** (issue #214): while a field is picking,
 * every header is a button that assigns its column to that field, and the pane
 * says so — a mode the user cannot see is a mode that eats their next click. The
 * assignment goes back out through `onPickColumn`; nothing about the value is
 * decided here, the form's select being the only thing that holds it.
 */
export function CsvFileTable({
  fileName,
  headers,
  rows,
  rowIds,
  highlight,
  marks,
  activeColumn = null,
  pickingFor = null,
  onPickColumn,
}: {
  /** The dropped file's name — what the pane and its table are called. */
  fileName: string;
  /** The file's real header row, in the file's own order. */
  headers: readonly string[];
  /** Every row of it, keyed by header, as delivered. */
  rows: ReadonlyArray<Record<string, string>>;
  /** Positional with `rows`: the **stable row id** each line is paired by (issue #215). */
  rowIds?: readonly RowId[];
  /** The pairing with the table opposite; absent where there is no table of rows to pair with. */
  highlight?: RowHighlight;
  /** What each mapped column feeds, derived from the draft; absent when none is being built. */
  marks?: ColumnMarks;
  /** The header the field the user is currently in points at, marked more strongly. */
  activeColumn?: string | null;
  /** The field waiting for a header click, by its badge (`"Date"`); `null` when none is. */
  pickingFor?: string | null;
  /** What a header click answers with — the header's own name, as the file writes it. */
  onPickColumn?: (header: string) => void;
}) {
  // Pick mode needs somewhere to send the answer, so a caller that offers no
  // handler cannot put the table into it by accident.
  const picking = pickingFor !== null && onPickColumn !== undefined;
  // What the draft makes of each column, once for the whole table: its badges,
  // and which of the three marked states it is in.
  const columns = headers.map((header) => {
    const labels = marks?.get(header) ?? [];
    return { header, labels, mark: columnMark(labels.length > 0, header === activeColumn) };
  });

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-gousse-line">
      {/* Outside the scroller, so the file being read stays named however far
          down its rows the user has gone. */}
      <p className="px-3 pt-3 text-sm text-gousse-muted">
        <span className="font-medium text-gousse-ink">{fileName}</span> — {rows.length}{" "}
        {rows.length === 1 ? "row" : "rows"}, as delivered
      </p>

      {/* What the next click will mean, said where the click has to land. An
          `<output>` — an implicit polite live region, the shape the rest of the
          app says this in — rather than an alert: the user asked for this mode,
          so it is the state of the pane and not an interruption. */}
      {picking ? (
        <output className="px-3 text-gousse-accent text-sm">
          Click a column header to use it as the {pickingFor} column — Escape leaves it unchanged.
        </output>
      ) : null}

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
              {columns.map(({ header, labels, mark }, index) => (
                <TableHead
                  key={index}
                  // The mapping is *announced*, not left to a badge and a
                  // tint: a colour is no use to a screen reader, and "which
                  // column feeds the date" is exactly what this pane is for.
                  aria-label={
                    labels.length > 0 ? `${header} — mapped to ${labels.join(", ")}` : undefined
                  }
                  // The one the current answer points at, said as the current
                  // item of the set it is one of.
                  aria-current={mark === "active" ? "true" : undefined}
                  data-column-mark={mark}
                  className={cn(
                    "whitespace-nowrap",
                    columnTint(mark),
                    labels.length > 0 && "text-gousse-ink",
                  )}
                >
                  {/* In pick mode the header *is* the control — a real button,
                      so the route is a keyboard's as much as a pointer's, and
                      one that exists only while a field is asking so the table
                      is not twenty tab stops the rest of the time. */}
                  {picking ? (
                    <button
                      type="button"
                      aria-label={`Use ${header} as the ${pickingFor} column`}
                      className="-mx-1 rounded-full px-1 outline-none hover:bg-gousse-accent/20 focus-visible:ring-2 focus-visible:ring-gousse-accent"
                      onClick={() => onPickColumn?.(header)}
                    >
                      <HeaderName header={header} labels={labels} />
                    </button>
                  ) : (
                    <HeaderName header={header} labels={labels} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Keyed by position: nothing here selects, edits or reorders the
                rows, and the **stable row id** below is a claim about which
                *record* a line produced rather than a key for this table. */}
            {rows.map((row, index) => (
              <TableRow
                key={index}
                className={ROW_HIGHLIGHT_TINT}
                {...highlight?.row(rowIds?.[index])}
              >
                {headers.map((header, column) => {
                  // The tint runs the height of the column, not just its
                  // header: what makes a mapping judgeable is the *values*
                  // under it, so those are what has to be picked out. Read off
                  // the header row's pass rather than re-derived here, which a
                  // few-thousand-row statement would do a few thousand times.
                  const mark = columns[column]?.mark;
                  return (
                    <TableCell
                      key={column}
                      data-column-mark={mark}
                      className={cn(
                        "whitespace-nowrap",
                        mark === undefined ? "text-gousse-muted" : "text-gousse-ink",
                        columnTint(mark),
                      )}
                    >
                      {row[header] ?? ""}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
