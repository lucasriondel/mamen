import { type ReactNode, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/** What one arrow key is worth, as a share of the width. */
const KEY_STEP = 0.05;

export interface SplitViewProps {
  /** The pane on the left, and the greater one at the usual ratios. */
  left: ReactNode;
  /** The pane on the right. */
  right: ReactNode;
  /** The left pane's share of the width, in `0..1`. */
  ratio: number;
  /** Where the divider was moved to — clamping is the caller's (its hook's). */
  onRatioChange: (ratio: number) => void;
  /** How far the divider may go, as the left pane's share. Defaults to 20–80%. */
  minRatio?: number;
  maxRatio?: number;
  /** What the divider is called for assistive tech. */
  dividerLabel?: string;
  /**
   * Extra classes for the row that holds both panes — tailwind-merged, so a
   * caller says how tall the split is without restating the layout. A split
   * with no height of its own has no pane to scroll *inside*, so a caller that
   * wants the two panes to scroll independently gives one here.
   */
  className?: string;
}

/**
 * Two panes side by side, each scrolling on its own, with a divider the user
 * can drag between them (issue #210, PRD #208).
 *
 * A layout primitive: it knows nothing about what is in either slot. The PDF
 * import path fills the left with the statement's blob-URL iframe; nothing
 * about this component says so, which is the point — the panes' only shared
 * property is the space they occupy.
 *
 * Each pane is its own scroll context rather than the page being one. Before
 * this, the import wizard's split scrolled as a single column, so reading down
 * the extracted rows carried the statement off the top of the screen — the one
 * thing a side-by-side view exists to prevent.
 *
 * The ratio is a *controlled* value, deliberately. Where the divider sits is a
 * preference that outlives any one mounting of the split (see the import
 * wizard's `useSplitRatio`), and a layout component is the wrong place to keep
 * something that has to survive it.
 *
 * The divider is the ARIA **window splitter**: a focusable `separator` carrying
 * its position, so the arrow keys move it as well as the pointer does. A
 * mouse-only divider would put the layout out of reach of a keyboard for good,
 * since there is nothing else on the page that moves it.
 */
export function SplitView({
  left,
  right,
  ratio,
  onRatioChange,
  minRatio = 0.2,
  maxRatio = 0.8,
  dividerLabel = "Resize the panes",
  className,
}: SplitViewProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  // The splitter's position is a claim about one pane, so it names which one.
  const leftPaneId = useId();

  const clamp = (next: number) => Math.min(maxRatio, Math.max(minRatio, next));
  const percent = Math.round(clamp(ratio) * 100);

  /** Put the divider wherever the pointer is, as a share of the row's width. */
  const pointAt = (clientX: number) => {
    const box = rowRef.current?.getBoundingClientRect();
    // A row with no width yet (first paint, or a DOM that never lays out) has no
    // ratio to read off the pointer — leaving it where it is beats jumping it to
    // an end.
    if (!box || box.width === 0) return;
    onRatioChange(clamp((clientX - box.left) / box.width));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowLeft":
        onRatioChange(clamp(ratio - KEY_STEP));
        break;
      case "ArrowRight":
        onRatioChange(clamp(ratio + KEY_STEP));
        break;
      case "Home":
        onRatioChange(minRatio);
        break;
      case "End":
        onRatioChange(maxRatio);
        break;
      default:
        return;
    }
    // Only once a key was ours: the page still needs Tab, and the panes still
    // need every key that scrolls them.
    event.preventDefault();
  };

  return (
    <div ref={rowRef} className={cn("flex min-h-0 items-stretch gap-2", className)}>
      {/* `flex-basis: 0` with a grow of the percentage: the two panes divide
          whatever the divider and the gaps leave, which is what keeps their
          shares adding up however wide the row is. `min-w-0` so a wide table
          scrolls inside its pane instead of pushing the other one off. */}
      <div
        id={leftPaneId}
        style={{ flexGrow: percent, flexBasis: 0 }}
        className="min-w-0 overflow-auto"
      >
        {left}
      </div>

      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA window-splitter pattern; no HTML element carries a draggable boundary
        role="separator"
        tabIndex={0}
        aria-label={dividerLabel}
        aria-controls={leftPaneId}
        aria-orientation="vertical"
        aria-valuemin={Math.round(minRatio * 100)}
        aria-valuemax={Math.round(maxRatio * 100)}
        aria-valuenow={percent}
        aria-valuetext={`Left pane ${percent}% of the width`}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          // Capture and focus only: a click that merely lands on the divider is
          // how the keyboard route is reached, and must not fling the panes to
          // wherever the pointer happened to be.
          event.currentTarget.setPointerCapture?.(event.pointerId);
          event.currentTarget.focus();
        }}
        onPointerMove={(event) => {
          // `buttons` is the drag: a hover must not move anything.
          if (event.buttons === 0) return;
          pointAt(event.clientX);
        }}
        className={cn(
          "w-1.5 shrink-0 cursor-col-resize touch-none rounded-full bg-gousse-line outline-none",
          "transition-colors hover:bg-gousse-accent focus-visible:bg-gousse-accent",
          "focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel",
        )}
      />

      <div style={{ flexGrow: 100 - percent, flexBasis: 0 }} className="min-w-0 overflow-auto">
        {right}
      </div>
    </div>
  );
}
