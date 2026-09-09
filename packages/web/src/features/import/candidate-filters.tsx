import type { Table as TanStackTable } from "@tanstack/react-table";
import { Check, Columns3, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { rawSourceColumnId } from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";
import type { Facet } from "./facets";

/**
 * The bar above an import preview's table (issue #195): its **row facets**, the
 * toggle that shows the statement's own columns, and what the two are hiding.
 *
 * Every control here is derived from the file in front of the user — the facets
 * from {@link facetColumns}, the columns from the same keys — so a bank mamen has
 * never seen gets them with no configuration and no setup.
 *
 * The filters live in the table's own state and nowhere else, which is what makes
 * them ephemeral (PRD #190): they are gone with the wizard, and a durable "always
 * hold out this type" rule belongs to the **Statement Format**'s row filter
 * rather than to remembered UI state.
 */
export function CandidateFilters<T>({
  table,
  facets,
}: {
  table: TanStackTable<CandidateRow<T>>;
  /** The facet-eligible columns of the rows on screen. */
  facets: readonly Facet[];
}) {
  const shown = table.getFilteredRowModel().rows.length;
  const total = table.getPreFilteredRowModel().rows.length;
  const filtering = table.getState().columnFilters.length > 0;
  const hideable = table.getAllColumns().filter((column) => column.getCanHide());

  if (facets.length === 0 && hideable.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pt-2">
      {facets.map((facet) => (
        <FacetPicker key={facet.column} table={table} facet={facet} />
      ))}

      {hideable.length === 0 ? null : <ColumnsPicker table={table} />}

      {filtering ? (
        <>
          {/* A narrowed table must not read as a short statement — the rows a
              filter is hiding are still going to be committed. */}
          <output className="text-gousse-muted text-sm">
            Showing {shown} of {total} rows
          </output>
          <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
            Clear filters
          </Button>
        </>
      ) : null}
    </div>
  );
}

/**
 * One column's facet: a popover listing the values it prints, each with the rows
 * behind it, any number of which can be chosen at once.
 *
 * Choosing several values of one column is an **or** (a row matching any of them
 * survives); choosing values in two columns is an **and**, which is TanStack's
 * own composition of column filters and the same way the transactions filter bar
 * reads.
 *
 * Items are `menuitemcheckbox` buttons rather than real checkboxes, so the whole
 * row is one hit target and the popover survives a toggle — the user is usually
 * picking more than one. The same shape as the transactions grid's column menu.
 */
function FacetPicker<T>({ table, facet }: { table: TanStackTable<CandidateRow<T>>; facet: Facet }) {
  const column = table.getColumn(rawSourceColumnId(facet.column));
  const chosen = (column?.getFilterValue() as string[] | undefined) ?? [];

  const toggle = (value: string) => {
    const next = chosen.includes(value)
      ? chosen.filter((one) => one !== value)
      : [...chosen, value];
    // An empty list is *no filter*, not a filter matching nothing: a facet the
    // user has emptied has to give the hidden rows back.
    column?.setFilterValue(next.length === 0 ? undefined : next);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" size="sm" aria-label={`Filter by ${facet.column}`}>
            <ListFilter size={14} />
            {facet.column}
            {chosen.length > 0 ? (
              <span className="tabular-nums text-gousse-accent">({chosen.length})</span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-1">
        <div role="menu" aria-label={`${facet.column} values`}>
          {facet.values.map(({ value, count }) => {
            const picked = chosen.includes(value);
            return (
              <button
                key={value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={picked}
                onClick={() => toggle(value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-full px-3 py-1.5 text-left text-sm text-gousse-ink",
                  "outline-none transition-colors hover:bg-gousse-bg focus-visible:bg-gousse-bg",
                )}
              >
                <Check
                  size={14}
                  className={cn("shrink-0 text-gousse-accent", !picked && "invisible")}
                />
                <span className="truncate">{value}</span>{" "}
                {/* The separating space is explicit: it is part of the item's
                    accessible name, which is "Exécution d'ordre (15)" — the
                    value and the rows behind it, as read out. */}
                <span className="ml-auto tabular-nums text-gousse-muted">({count})</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The "Columns" menu — every one of the statement's own columns, hidden until
 * asked for, so the user can read the value they are filtering on.
 *
 * Only the raw-source columns are in it: `getCanHide` is false for the preview's
 * own, because date, operation label and amount are what makes a row readable.
 */
function ColumnsPicker<T>({ table }: { table: TanStackTable<CandidateRow<T>> }) {
  const hideable = table.getAllColumns().filter((column) => column.getCanHide());
  const shown = hideable.filter((column) => column.getIsVisible()).length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" size="sm" aria-label="Choose columns">
            <Columns3 size={14} />
            Columns
            {shown > 0 ? (
              <span className="tabular-nums text-gousse-muted">({shown} shown)</span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-1">
        <div role="menu" aria-label="Toggle columns">
          {hideable.map((column) => {
            const visible = column.getIsVisible();
            return (
              <button
                key={column.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                onClick={() => column.toggleVisibility(!visible)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-full px-3 py-1.5 text-left text-sm text-gousse-ink",
                  "outline-none transition-colors hover:bg-gousse-bg focus-visible:bg-gousse-bg",
                )}
              >
                <Check
                  size={14}
                  className={cn("shrink-0 text-gousse-accent", !visible && "invisible")}
                />
                <span className="truncate">{String(column.columnDef.header)}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
