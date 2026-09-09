import { useVirtualizer } from "@tanstack/react-virtual";
import type { IconName } from "lucide-react/dynamic";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { CategoryIcon, ICON_NAMES } from "@/components/category-icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Cells per row, and the height of one row in px — the grid is uniform. */
const COLUMNS = 6;
const ROW_HEIGHT = 40;
/** The scroll box's height (`h-60`) in px — fixed, so the grid can seed its rect. */
const GRID_HEIGHT = 240;

/**
 * Candidates for a query, matched on the Lucide id itself. The id *is* the
 * searchable text (ADR 0006): `shopping-cart` is what a user types and what the
 * row stores, so there is no separate label to index. Hyphens are ignored on the
 * query side so "shoppingcart" and "shopping cart" both land.
 */
export function filterIconNames(query: string): readonly IconName[] {
  const needle = query
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "");
  if (needle.length === 0) return ICON_NAMES;
  return ICON_NAMES.filter((name) => name.replace(/-/g, "").includes(needle));
}

export interface IconGridProps {
  /** The staged **Icon name** — which cell reads as chosen. */
  value: string;
  /** The draft's colour, so the chosen cell matches what Save would store. */
  color?: string;
  /** A write is in flight; the grid stays up but won't stage a second pick. */
  pending?: boolean;
  onSelect: (icon: IconName) => void;
  /** Take focus on mount — the panel opens ready to be typed into. */
  autoFocus?: boolean;
}

/**
 * The **Icon name** half of the appearance editor (issue #58, unwrapped in
 * #130): a filter field over Lucide's whole set and a grid of candidates. It has
 * no popover and no trigger of its own — {@link AppearancePicker} owns those,
 * because the icon and the colour are two halves of one editor and one commit.
 *
 * Two costs are avoided deliberately, because ~1,600 candidates make both real:
 * the grid is **virtualised**, so the DOM holds one screenful of cells rather
 * than 1,600 buttons; and each cell draws through {@link CategoryIcon}, whose
 * registry is a map of `() => import()` thunks, so only the glyphs actually on
 * screen are ever fetched. Scrolling or filtering fetches the newly visible ones
 * and nothing else.
 *
 * Keyboard: the field takes focus on open, `ArrowDown` **or Enter** steps into
 * the grid, and the arrows walk it in two dimensions with a roving `tabIndex` —
 * one tab stop for the whole grid, not one per cell. Enter is caught rather than
 * left to the platform because the panel around this is a form: the field
 * *filters*, so implicit submission would make typing a name commit the row.
 *
 * Picking **stages** rather than committing: it reports the name and leaves the
 * panel up, so the colour can still be chosen in the same visit.
 */
export function IconGrid({ value, color, pending, onSelect, autoFocus }: IconGridProps) {
  const [query, setQuery] = useState("");
  /** Which cell the roving `tabIndex` sits on. */
  const [active, setActive] = useState(0);
  /**
   * The cell to *move focus to* after the next render, or `null` for "leave
   * focus alone". Separate from {@link active} because that also resets when the
   * query changes — which must not yank focus out of the field being typed in.
   */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLFieldSetElement>(null);

  const matches = useMemo(() => filterIconNames(query), [query]);
  const rowCount = Math.ceil(matches.length / COLUMNS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
    // The scroll box is a fixed `h-60`, so its size is known before it is
    // measured. Seeding it means the first paint already shows a full window
    // instead of an empty box that fills in a frame later.
    initialRect: { width: 288, height: GRID_HEIGHT },
  });

  // Move focus only when a key asked for it, and only once the target cell has
  // actually been rendered — an off-screen row is scrolled into range first, so
  // the element may not exist until the pass after `scrollToIndex`.
  useEffect(() => {
    if (focusIndex === null) return;
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-icon-index="${focusIndex}"]`);
    if (cell === null || cell === undefined) return;
    cell.focus();
    setFocusIndex(null);
  }, [focusIndex]);

  const focusCell = (index: number) => {
    const clamped = Math.max(0, Math.min(index, matches.length - 1));
    setActive(clamped);
    virtualizer.scrollToIndex(Math.floor(clamped / COLUMNS));
    setFocusIndex(clamped);
  };

  /**
   * Stage a name — refused outright while a write is in flight rather than only
   * greyed out, because `disabled` is a hint the pointer can be made to ignore
   * and this is the guard that actually holds.
   */
  const stage = (name: IconName) => {
    if (pending) return;
    onSelect(name);
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const step =
      event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowLeft"
          ? -1
          : event.key === "ArrowDown"
            ? COLUMNS
            : event.key === "ArrowUp"
              ? -COLUMNS
              : null;
    if (step === null) {
      if (event.key === "Home") {
        event.preventDefault();
        focusCell(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusCell(matches.length - 1);
      }
      return;
    }
    event.preventDefault();
    focusCell(active + step);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="text-gousse-muted text-xs uppercase tracking-wide">Icon</span>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          // Down out of the field is the way into the grid — otherwise the only
          // route to a cell is the mouse. Enter goes the same way rather than
          // submitting the panel around it: this field filters, it never
          // commits.
          if (e.key !== "ArrowDown" && e.key !== "Enter") return;
          e.preventDefault();
          if (matches.length > 0) focusCell(active);
        }}
        placeholder="Search icons…"
        aria-label="Search icons"
        spellCheck={false}
        autoComplete="off"
        disabled={pending}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the caller decides, and it only ever opens this grid in a popover
        autoFocus={autoFocus}
      />
      {matches.length === 0 ? (
        <p className="px-2 py-6 text-center text-gousse-muted text-sm">
          No icons match “{query.trim()}”.
        </p>
      ) : (
        <div ref={scrollRef} className="h-60 overflow-y-auto overscroll-contain">
          {/*
           * A `fieldset` rather than a `div role="group"`: the grouping is
           * native, so the role and its name need no ARIA, and the cells are
           * real controls. The arrow keys are routed from the container
           * because the roving `tabIndex` means only one cell is focusable at
           * a time — a handler per cell would be 1,600 identical closures.
           */}
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the arrows are routed here for the reason stated just above: a roving `tabIndex` leaves one cell focusable at a time */}
          <fieldset
            ref={gridRef}
            aria-label="Icons"
            onKeyDown={handleGridKeyDown}
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((row) => (
              <div
                key={row.key}
                className="absolute inset-x-0 flex"
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                {matches
                  .slice(row.index * COLUMNS, row.index * COLUMNS + COLUMNS)
                  .map((name, column) => {
                    const index = row.index * COLUMNS + column;
                    return (
                      <button
                        key={name}
                        type="button"
                        data-icon-index={index}
                        // Roving tabIndex: the grid is one tab stop, not 1,600.
                        tabIndex={index === active ? 0 : -1}
                        aria-label={name}
                        aria-pressed={name === value}
                        title={name}
                        disabled={pending}
                        onFocus={() => setActive(index)}
                        onClick={() => stage(name)}
                        className={cn(
                          "flex flex-1 items-center justify-center rounded-full outline-none",
                          "hover:bg-gousse-bg focus-visible:ring-2 focus-visible:ring-gousse-accent",
                          name === value && "bg-gousse-bg",
                        )}
                      >
                        <CategoryIcon
                          name={name}
                          color={name === value ? color : undefined}
                          size={18}
                        />
                      </button>
                    );
                  })}
              </div>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}
