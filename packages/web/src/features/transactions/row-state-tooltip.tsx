import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** One line of the tooltip: a swatch matching the rail, a name, and what it means. */
type RowState = {
  /** The rail colour this line explains, as a CSS colour. */
  swatch: string;
  label: string;
  detail: string;
};

/**
 * What each state says. Kept beside the rail's own colours in `row-rail.css` —
 * if one moves, the other has to move with it.
 */
const STATES = {
  uncurated: {
    swatch: "rgb(var(--gousse-high))",
    label: "Needs curating",
    detail: "No issuer, category or note yet. Click a red field to fill it in.",
  },
  bundle: {
    swatch: "rgb(var(--gousse-accent))",
    label: "Bundle",
    detail: "One cost told in several rows. Expand it to see what it stands for.",
  },
  excluded: {
    swatch: "rgb(var(--gousse-muted) / 0.55)",
    label: "Excluded from recap",
    detail: "Held out of every total. Untick Excluded to count it again.",
  },
} as const satisfies Record<string, RowState>;

/**
 * The **gutter tooltip** — hovering a row's leading cell explains the rail
 * painted there.
 *
 * It replaces the standing legend an earlier draft put under the grid. A legend
 * makes the reader carry three colours to the row and map them back; explaining
 * the rail in place names only the states *this* row actually has, and a row
 * carrying two gets both lines in the order the rail paints them.
 *
 * **The 3px rail is not the hover target.** 3px is far below a usable one and
 * is unhittable by touch, so the trigger fills the whole leading cell — full
 * row height, full column width — and sits behind the cell's own content
 * (`-z-10`) so the selection checkbox keeps its hit area. It is not focusable:
 * it would put a second tab stop on every row of a table whose rows are already
 * links, and everything it says is available without it (see below).
 *
 * **Nothing here is load-bearing.** `ui/tooltip.tsx` states the rule — a
 * tooltip cannot be opened by touch and is skipped by some assistive tech, and
 * on Base UI the trigger gets no `aria-describedby` — so this is a convenience
 * layer over marks that are already in the row: the red dotted Issuer/Category
 * cells, the muted amount, the bundle's member count. The trigger still carries
 * an `aria-label` with the same sentences, which is the one piece of wiring
 * Base UI will not do for us.
 */
export function RowStateTooltip({
  uncurated,
  bundle,
  excluded,
}: {
  uncurated: boolean;
  bundle: boolean;
  excluded: boolean;
}) {
  // In the order the rail paints them, so a two-state row reads top to bottom
  // the way its gutter does.
  const states = [
    uncurated ? STATES.uncurated : undefined,
    bundle ? STATES.bundle : undefined,
    excluded ? STATES.excluded : undefined,
  ].filter((state) => state !== undefined);

  // A row in no particular state has no rail, so there is nothing to explain.
  if (states.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            // Fills the cell, so the *whole leading gutter* is the hover
            // target: the rail itself is 3px, far below a usable one and
            // unhittable by touch.
            //
            // `z-0` puts it above the cell's own background — at `-z-10` the
            // `td` swallowed the pointer and the tooltip never opened — while
            // the selection checkbox is lifted to `z-10` beside it, so the two
            // share the cell without either stealing the other's hit area.
            //
            // `aria-hidden` with the label on it would be contradictory, so the
            // label rides alone: a screen reader meets it as static text inside
            // the row it describes.
            className="absolute inset-0 z-0"
            aria-label={states.map((state) => `${state.label}. ${state.detail}`).join(" ")}
          />
        }
      />
      <TooltipContent className="max-w-64">
        {states.map((state) => (
          <span key={state.label} className="block not-first:mt-2 not-first:border-gousse-line/60">
            <span className="flex items-center gap-1.5 font-medium">
              <span
                className="h-3 w-[3px] shrink-0 rounded-full"
                style={{ background: state.swatch }}
                aria-hidden
              />
              {state.label}
            </span>
            <span className="mt-0.5 block text-gousse-muted">{state.detail}</span>
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
