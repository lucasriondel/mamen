import { Check, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One choice in the menu. The first is the resting state; see {@link FilterIconMenu}. */
export interface FilterMenuOption<T extends string> {
  value: T;
  label: string;
}

export interface FilterIconMenuProps<T extends string> {
  /** The glyph — the control's whole visible identity, so it must be distinct. */
  icon: LucideIcon;
  /** Names the control in the tooltip and to assistive tech. */
  label: string;
  /** The choices, resting state first. */
  options: readonly FilterMenuOption<T>[];
  /** The applied choice. Equal to the first option's value when nothing is applied. */
  value: T;
  onChange: (next: T) => void;
  /**
   * Which token tints the applied state, matching {@link FilterIconToggle} so
   * the rail's two kinds of control cannot drift apart.
   */
  tone?: "accent" | "high";
}

/**
 * A **tri-state filter as a single icon button** — the menu-backed sibling of
 * {@link FilterIconToggle}, for the filters that have three states rather than
 * two: *Recap* (all / counted / excluded) and *Transfers* (all / only /
 * exclude).
 *
 * These two were segmented controls on a second row under the rail, each with
 * the word naming it stacked above. That cost the bar a whole row and about
 * 400px to say three things — and it said them *loudly*, permanently showing
 * every option of two filters that are usually left alone, while *Grouped* and
 * *Uncurated* sat in the rail as bare glyphs. Two kinds of filter, two kinds of
 * shape, one of them ten times the size of the other for no reason the user
 * could see.
 *
 * So they collapse into the rail as icons and read like their neighbours. The
 * difference that remains is the one that matters: a toggle applies on click, a
 * tri-state opens its three choices, because there is no way to cycle three
 * states with one button that a user can predict.
 *
 * **The resting option is "no filter", and it must be first.** A menu of three
 * peers has no off state visible, so the list leads with the one that clears —
 * the same convention the period menu's *Clear* follows.
 *
 * The button tints only when a narrowing option is applied, never on the
 * resting one, so the rail still answers "is this list narrowed?" at a glance —
 * which was the one thing the segmented control did well and the thing an
 * untinted icon would have lost.
 */
export function FilterIconMenu<T extends string>({
  icon: Icon,
  label,
  options,
  value,
  onChange,
  tone = "accent",
}: FilterIconMenuProps<T>) {
  const [open, setOpen] = useState(false);
  // The resting option leads the list, so "is a filter applied?" is "is this
  // not the first one?" — no separate notion of an empty value to keep in sync.
  const resting = options[0]?.value;
  const active = value !== resting;
  const current = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  // The value, not just the name: a screen reader gets "Recap:
                  // Excluded" rather than being told only which control this is.
                  aria-label={`${label}: ${current?.label ?? "All"}`}
                  className={cn(
                    "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
                    active
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
          }
        />
        {/* The tooltip names the control *and* states its value, so a hover
            answers "what is this?" and "what is it set to?" in one stop. */}
        <TooltipContent>{active ? `${label}: ${current?.label}` : label}</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-48 p-0">
        <Command>
          <div className="px-3 pt-2.5 pb-1">
            <span className="text-[11px] text-gousse-muted uppercase tracking-wider">{label}</span>
          </div>
          <CommandList className="max-h-none">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn("justify-between", selected && "font-medium text-gousse-accent")}
                >
                  <span>{option.label}</span>
                  {/* The tick states which option is in force, the same mark
                      the period menu uses for the same job. */}
                  {selected ? <Check size={14} aria-hidden /> : null}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
