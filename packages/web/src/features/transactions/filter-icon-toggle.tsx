import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FilterIconToggleProps {
  /** The glyph — the control's whole visible identity, so it must be distinct. */
  icon: LucideIcon;
  /** Names the control in the tooltip and to assistive tech. */
  label: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /**
   * Which token tints the pressed state. `high` for *Uncurated only*, matching
   * the tint the table paints on the rows it isolates; `accent` otherwise.
   */
  tone?: "accent" | "high";
}

/**
 * A boolean filter as a single icon button — the shrunk form of the bar's
 * *Grouped only* / *Uncurated only* toggles.
 *
 * The text came off because the glyph already carried the meaning: `Layers` and
 * `ListChecks` are distinct at a glance, and a labelled pill spent ~140px each
 * to repeat what the icon said. The name is not lost — it is in the tooltip and
 * in `aria-label`, so it is one hover or one screen-reader stop away rather than
 * permanently occupying the bar.
 *
 * **The pressed state tints the surface, not the glyph.** Colouring the icon to
 * match its fill sank it into its own background (worst in dark mode, where the
 * `high` red on a `high/14` fill is nearly one value); the icon stays `ink` and
 * the pill behind it carries the colour, so the state reads and the glyph stays
 * legible.
 *
 * The app's `Tooltip` rather than a native `title`: `title` waits about a
 * second, cannot be styled, never appears for keyboard or touch users, and is
 * drawn wide enough to cover the neighbouring control in a tight row of icons.
 */
export function FilterIconToggle({
  icon: Icon,
  label,
  pressed,
  onPressedChange,
  tone = "accent",
}: FilterIconToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-pressed={pressed}
            aria-label={label}
            onClick={() => onPressedChange(!pressed)}
            className={cn(
              "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
              pressed
                ? tone === "high"
                  ? "border-gousse-high/40 bg-gousse-high/15 text-gousse-ink"
                  : "border-gousse-accent/40 bg-gousse-accent/15 text-gousse-ink"
                : "border-transparent text-gousse-muted hover:bg-gousse-line/40 hover:text-gousse-ink",
            )}
          >
            <Icon size={16} />
          </button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
