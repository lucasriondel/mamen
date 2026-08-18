import { ArrowDown, ArrowUp } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type IssuerSort, type IssuerSortKey, nextIssuerSort } from "./issuer-sort";

export interface IssuersTableHeadProps {
  /** Which sort key this column ranks by. */
  sortKey: IssuerSortKey;
  label: string;
  /** The table's current sort, so the active column can show its direction. */
  sort: IssuerSort;
  onSortChange: (sort: IssuerSort) => void;
  /** Right-align the numeric columns (transactions, total). */
  align?: "left" | "right";
}

/**
 * A sortable column header for the issuers table (issue #41). Clicking the
 * active column flips its direction; clicking another switches to it at that
 * key's default direction — the rule lives in {@link nextIssuerSort}, shared
 * with the segmented control this replaced.
 *
 * `aria-sort` on the `<th>` is what tells a screen reader the table's current
 * ordering; the arrow is the sighted equivalent and is `aria-hidden`.
 */
export function IssuersTableHead({
  sortKey,
  label,
  sort,
  onSortChange,
  align = "left",
}: IssuersTableHeadProps) {
  const active = sort.key === sortKey;
  const DirectionIcon = sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        onClick={() => onSortChange(nextIssuerSort(sort, sortKey))}
        className={cn(
          "inline-flex items-center gap-1 rounded-full font-medium outline-none transition-colors hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent",
          active ? "text-gousse-ink" : "text-gousse-muted",
        )}
      >
        {label}
        {active ? <DirectionIcon size={14} aria-hidden /> : null}
      </button>
    </TableHead>
  );
}
