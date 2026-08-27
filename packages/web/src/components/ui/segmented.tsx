import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  /** The value this segment applies. */
  value: T;
  /** The segment's visible text — kept short; the group is laid out inline. */
  label: string;
}

export interface SegmentedProps<T extends string> {
  /** Names the group for assistive tech (there is no visible legend inside). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * A segmented control — one pill holding N mutually-exclusive options, the
 * active one raised.
 *
 * Built for the transactions bar's three-way filters (*Recap*, *Transfers*),
 * which were `<select>`s: a `<select>` hides its options behind a click and
 * shows only the chosen one, so a bar of them cannot be read at a glance —
 * "All rows" and "Excluded only" look identical until you parse the text. A
 * segmented control shows every option and lights the one in force, which is
 * what a filter with three states should look like.
 *
 * `radiogroup` rather than a `tablist`: these choose a value, they do not switch
 * between panels of content. Roving `tabIndex` matches the radio pattern — one
 * stop for the whole group, arrow keys within it — so a keyboard user tabs past
 * a three-option filter in one press rather than three.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedProps<T>) {
  const index = options.findIndex((option) => option.value === value);

  // Arrow keys move within the group and wrap, per the radio-group pattern.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    if (next != null) onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      // The group itself is not a tab stop — the checked segment is, per the
      // roving pattern below — but the role is interactive, so it needs an
      // explicit `-1` rather than none at all.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-gousse-line/70 bg-gousse-bg p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a real `input[type=radio]` cannot hold the raised pill this control is made of, and a visually-hidden input behind a label would lose the roving tabIndex that keeps a three-option filter one tab stop
            role="radio"
            aria-checked={active}
            // Roving: only the active segment is a tab stop.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
              active
                ? "bg-gousse-panel font-medium text-gousse-ink shadow-gousse-sm"
                : "text-gousse-muted hover:text-gousse-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
