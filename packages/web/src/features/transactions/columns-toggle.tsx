import type { VisibilityState } from "@tanstack/react-table";
import { Check, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TOGGLEABLE_COLUMNS, type ToggleableColumnId } from "./use-column-visibility";

export interface ColumnsToggleProps {
  /** The current visibility map; a missing id means "visible". */
  columnVisibility: VisibilityState;
  /** Show/hide one column. */
  onToggle: (columnId: ToggleableColumnId, visible: boolean) => void;
  /** Show every toggleable column again. */
  onReset: () => void;
}

/**
 * The column menu for the transactions table — a popover of checkbox items, one
 * per {@link TOGGLEABLE_COLUMNS} entry. Presentational: it renders the
 * visibility map it is given and emits changes; persistence lives in
 * `useColumnVisibility`.
 *
 * The trigger is an **eye**, matching the two boolean filters beside it in the
 * bar: at that size a labelled pill would be the only text left in a row of
 * glyphs. It is not a toggle though — it opens a menu — so it carries
 * `aria-haspopup` rather than `aria-pressed`, and the tooltip names it the way
 * the toggles' do.
 *
 * Items are `role="menuitemcheckbox"` buttons rather than real checkboxes so the
 * whole row is one hit target, and the popover stays open across toggles — the
 * user is usually adjusting several columns at once. A hidden column dims and
 * takes a struck-through eye, so the menu shows the table's state rather than
 * only offering to change it.
 *
 * **`Date` and `Amount` are listed as locked rather than omitted.** They are the
 * row's identity, so they are not toggleable (see `TOGGLEABLE_COLUMNS`) — but a
 * menu that simply leaves them out reads as a table with six columns. Naming
 * them as always-shown describes the whole table and states the rule.
 */
export function ColumnsToggle({ columnVisibility, onToggle, onReset }: ColumnsToggleProps) {
  const hiddenCount = TOGGLEABLE_COLUMNS.filter(
    (column) => columnVisibility[column.id] === false,
  ).length;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="secondary"
                  aria-label="Choose columns"
                  className={cn(
                    "size-9 shrink-0 justify-center border-transparent bg-transparent p-0",
                    "text-gousse-muted hover:bg-gousse-line/40 hover:text-gousse-ink",
                    // Hiding something is a state worth showing on the closed
                    // trigger, the same way a pressed toggle is.
                    hiddenCount > 0 &&
                      "border-gousse-accent/40 bg-gousse-accent/15 text-gousse-ink",
                  )}
                >
                  <Eye size={16} />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          {hiddenCount > 0 ? `Columns — ${hiddenCount} hidden` : "Columns"}
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
          <span className="text-[11px] tracking-wider text-gousse-muted uppercase">Columns</span>
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={onReset}
              className="cursor-pointer rounded-full px-1.5 py-0.5 text-xs text-gousse-accent outline-none hover:bg-gousse-accent/10 focus-visible:ring-2 focus-visible:ring-gousse-accent"
            >
              Show all
            </button>
          ) : null}
        </div>

        <div role="menu" aria-label="Toggle columns" className="flex flex-col gap-0.5">
          {TOGGLEABLE_COLUMNS.map((column) => {
            // Absent from the map means visible — TanStack's default.
            const visible = columnVisibility[column.id] !== false;
            return (
              <button
                key={column.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                onClick={() => onToggle(column.id, !visible)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-full px-2 py-1.5 text-left text-sm",
                  "outline-none transition-colors hover:bg-gousse-line/35 focus-visible:bg-gousse-line/35",
                  visible ? "text-gousse-ink" : "text-gousse-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-[17px] shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors",
                    visible
                      ? "border-gousse-accent bg-gousse-accent text-white"
                      : "border-gousse-line",
                  )}
                >
                  {visible ? <Check size={11} strokeWidth={3.5} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{column.label}</span>
                {visible ? null : (
                  <EyeOff size={14} className="shrink-0 text-gousse-muted" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-1.5 flex items-center gap-2 border-t border-gousse-line px-2 pt-2 text-xs text-gousse-muted">
          <Lock size={12} aria-hidden className="shrink-0" />
          Date and Amount always shown
        </p>
      </PopoverContent>
    </Popover>
  );
}
