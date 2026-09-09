/**
 * The columns a multi-column field reads, in the order they will be joined —
 * each carrying the way to take it back out.
 *
 * A list, said as one: the order *is* the answer, so it reads in order and each
 * entry says its own place in it. That is why the number is on screen rather than
 * implied by position alone — a screen reader hears "1 Date, 2 Libellé" and gets
 * the sentence the joined label will read as.
 */
export function PickedColumnChips({
  columns,
  badge,
  onRemove,
  onActiveColumn,
}: {
  /** The chosen columns, in the order they are joined. */
  columns: readonly string[];
  /** What the field is called on the file pane — `"Label"`. */
  badge: string;
  onRemove: (column: string) => void;
  /** Light this column on the file pane while the pointer is on its chip. */
  onActiveColumn: (column: string | null) => void;
}) {
  return (
    <ol aria-label={`${badge} columns, in order`} className="flex flex-wrap gap-1.5">
      {columns.map((column, index) => (
        <li key={column}>
          <span className="inline-flex items-center gap-1 rounded-full border border-gousse-line bg-gousse-panel py-0.5 pr-0.5 pl-2 text-xs text-gousse-text">
            <span className="tabular-nums text-gousse-muted">{index + 1}</span>
            {column}
            <button
              type="button"
              aria-label={`Remove ${column} from the ${badge} columns`}
              className="rounded-full px-1 text-gousse-muted transition-colors hover:text-gousse-text"
              onMouseEnter={() => onActiveColumn(column)}
              onMouseLeave={() => onActiveColumn(null)}
              onClick={() => onRemove(column)}
            >
              &times;
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
