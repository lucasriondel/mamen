import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { nextSpendSort, type SpendSort, type SpendSortKey } from "./recap-sort";

const OPTIONS: ReadonlyArray<{ key: SpendSortKey; label: string }> = [
  { key: "spent", label: "Spent" },
  { key: "name", label: "Name" },
];

export interface SpendSortControlProps {
  /** Accessible label distinguishing the two sections' controls. */
  label: string;
  sort: SpendSort;
  onChange: (sort: SpendSort) => void;
}

/**
 * A spend section's sort control (issue #35): a segmented row of the two sort
 * keys. Clicking the active key toggles its asc/desc direction (shown by the
 * arrow); clicking the other key switches to it at its default direction. Mirrors
 * the issuers grid's control; the ordering itself is applied by {@link sortSpendRows}.
 */
export function SpendSortControl({ label, sort, onChange }: SpendSortControlProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full border border-gousse-line bg-gousse-panel p-1"
    >
      {OPTIONS.map(({ key, label: optionLabel }) => {
        const active = sort.key === key;
        const DirectionIcon = sort.direction === "asc" ? ArrowUp : ArrowDown;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(nextSpendSort(sort, key))}
            className={cn(
              "flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors active:scale-[0.97] transition-transform focus-visible:ring-2 focus-visible:ring-gousse-accent outline-none",
              active
                ? "bg-gousse-accent/10 text-gousse-accent"
                : "text-gousse-muted hover:text-gousse-ink",
            )}
          >
            {optionLabel}
            {active ? <DirectionIcon size={14} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
