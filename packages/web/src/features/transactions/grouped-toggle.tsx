import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GroupedToggleProps {
  /** Whether the filter is currently applied. */
  pressed: boolean;
  /** Apply or clear the filter. */
  onPressedChange: (pressed: boolean) => void;
}

/**
 * The "Grouped only" filter toggle — narrows the table to the **bundle
 * parents**, the rows that stand for a group of transactions. One row per
 * bundle, each expandable in place to the transactions it covers, because the
 * list already ships a parent's members alongside it: so this one control
 * answers both *which* groups exist and *what* is in each.
 *
 * It lists parents rather than members deliberately. A member is reachable
 * through its parent, and listing both would show the same money twice — in the
 * rows and in the signed total beneath them — which is why `list` hides members
 * by default in the first place.
 *
 * A toggle rather than the three-way select *Recap* and *Transfers* use: both
 * halves of those are views a user asks for, but "everything that is not a
 * bundle parent" is not one, so the off state here is simply no filter.
 */
export function GroupedToggle({ pressed, onPressedChange }: GroupedToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "flex h-9 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
        pressed
          ? "border-gousse-accent/40 bg-gousse-accent/10 text-gousse-ink"
          : "border-gousse-line bg-gousse-panel text-gousse-muted hover:text-gousse-ink",
      )}
    >
      <Layers size={14} />
      Grouped only
    </button>
  );
}
