import type { IconName } from "lucide-react/dynamic";
import { type FormEvent, useId, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import {
  type Hsv,
  hexToHsv,
  hsvToHex,
  normaliseHex,
  PaletteGrid,
  SpectrumArea,
} from "@/components/color-fields";
import { IconGrid } from "@/components/icon-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** What one visit to the editor writes: both halves, or neither. */
export interface Appearance {
  /** A Lucide id in kebab-case (ADR 0006). */
  icon: string;
  /** `null` = resume inheriting from the nearest coloured ancestor. */
  color: string | null;
}

export interface AppearancePickerProps {
  /** The thing being restyled — names the trigger, e.g. "Change Food appearance". */
  label: string;
  /** The category's stored **Icon name**. */
  icon: string;
  /** Its **own** `color`; `null` = it inherits (ADR 0006). */
  color: string | null;
  /** Its **Resolved colour** — what the trigger paints, stored or inherited. */
  resolved: string;
  /** A write is in flight; the panel stays open but won't fire a second one. */
  pending?: boolean;
  onSubmit: (appearance: Appearance) => void;
  className?: string;
  /**
   * Render the popover here instead of `document.body` — required inside a modal
   * dialog, whose scroll lock would otherwise freeze the icon grid. See
   * {@link PopoverContent}'s `portalContainer`.
   */
  portalContainer?: HTMLElement | null;
}

/**
 * The **appearance editor** for a category: one trigger, one panel, one write
 * (issue #130).
 *
 * A row used to carry two triggers two pixels apart — the icon chip and the
 * colour swatch — each opening its own popover, so setting up a new category was
 * two open/choose/save cycles against two halves of one thing. They are one
 * control now: the {@link IconGrid} and the palette/spectrum/hex of issue #128
 * side by side over a **preview** of what Save would store, and a single commit
 * gesture that sends both fields together.
 *
 * Everything each half meant is unchanged. The icon is a Lucide id (ADR 0006);
 * the colour keeps its **inherit** semantics — `null` is a *reference* to the
 * nearest coloured ancestor, not an absent value, so the trigger paints the
 * **Resolved colour** either way and says which of the two it is. Clearing is
 * offered only when the draft has something to clear, and it *stages* `null`
 * like every other gesture here, so an icon chosen in the same visit is not lost
 * to a second, separate write.
 *
 * An unparseable colour is refused rather than sent: `color` is a bare
 * `Schema.String` on the wire, so the server would happily store "purple-ish"
 * and every descendant inheriting it would paint nothing.
 */
export function AppearancePicker({
  label,
  icon,
  color,
  resolved,
  pending,
  onSubmit,
  className,
  portalContainer,
}: AppearancePickerProps) {
  const [open, setOpen] = useState(false);
  /** The staged icon — a Lucide id, not committed until Save. */
  const [draftIcon, setDraftIcon] = useState(icon);
  /** The staged colour as typed; `""` is the draft that inherits. */
  const [draft, setDraft] = useState(color ?? "");
  const [invalid, setInvalid] = useState(false);
  /**
   * Where the spectrum is standing. Seeded from the **Resolved colour** when the
   * category inherits: there is no stored colour to start from, and starting on
   * black would make the first drag begin somewhere the row has never been.
   */
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color ?? resolved));
  // One picker renders per tree row, so a static id would collide across rows.
  const fieldId = useId();
  const errorId = useId();

  /** What Save would paint: the staged colour, or the inherited one it defers to. */
  const previewColor = normaliseHex(draft) ?? resolved;
  /** Nothing staged — Save would write `null` and the category would inherit. */
  const inherits = draft.trim().length === 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Re-seed **both** halves from the row on every open, so a cancelled edit
    // (Escape, or clicking away) never leaks into the next one — an icon staged
    // and thrown away must not come back any more than a colour does.
    if (next) {
      setDraftIcon(icon);
      setDraft(color ?? "");
      setHsv(hexToHsv(color ?? resolved));
      setInvalid(false);
    }
  };

  /**
   * The draft text, and the spectrum moved to wherever it now points. The field
   * and the palette both land here: a swatch click is the same event as typing
   * that colour's code, and two ways into the draft is how the halves of a
   * popover drift apart.
   */
  const handleDraft = (next: string) => {
    setDraft(next);
    setInvalid(false);
    const hex = normaliseHex(next);
    if (hex === null) return;
    setHsv((previous) => {
      const point = hexToHsv(hex);
      // A grey carries no hue, so typing `#ffffff` would otherwise swing the
      // track to red. Keep the hue the spectrum was already on.
      return point.s === 0 ? { ...point, h: previous.h } : point;
    });
  };

  /** A spectrum move into the draft, already canonically spelled. */
  const moveSpectrum = (next: Hsv) => {
    setHsv(next);
    setDraft(hsvToHex(next));
    setInvalid(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // …and stop it reaching a form *above* this one. The popover portals into
    // its host — the create dialog hands it the modal's own node — but React
    // propagates events along the component tree, not the DOM, so without this
    // saving an appearance also submits the dialog that contains the trigger.
    event.stopPropagation();
    if (pending) return;
    // An empty draft is the *cleared* colour, not an unparseable one: it is what
    // Inherit stages, and it commits with whatever icon was chosen beside it.
    if (inherits) {
      onSubmit({ icon: draftIcon, color: null });
      setOpen(false);
      return;
    }
    const hex = normaliseHex(draft);
    if (hex === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit({ icon: draftIcon, color: hex });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Change ${label} appearance`}
            title={`Change ${label} appearance`}
            className={cn(
              "relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel",
              className,
            )}
          >
            <CategoryIcon name={icon} color={resolved} />
            {/* The glyph itself carries the **Resolved colour**, so the dot that
                used to sit on its corner is gone. What the dot also carried —
                whether that colour is the category's own or borrowed from an
                ancestor (`color: null`, ADR 0006) — stays here as state for
                tests and assistive tech to read, painted by nothing. */}
            <span
              hidden
              data-appearance-color={resolved}
              data-appearance-inherited={color === null ? "" : undefined}
            />
          </button>
        }
      />
      <PopoverContent className="w-[30rem] p-3" portalContainer={portalContainer}>
        {/*
         * One form, so Enter in the hex field commits the whole appearance and
         * the panel has exactly one submit button. Every other control in here
         * is a `type="button"` that stages — including *Inherit*, which must
         * never be what implicit submission reaches.
         */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {/* The draft is not on the row yet, so this is the only place the
                two halves can be seen against each other. */}
            <span
              data-appearance-preview={previewColor}
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gousse-line bg-gousse-bg"
            >
              <CategoryIcon name={draftIcon} color={previewColor} size={18} />
            </span>
            <span className="min-w-0 truncate font-medium text-gousse-ink text-sm">{label}</span>
            {inherits ? (
              <span className="ml-auto text-gousse-muted text-xs">Inheriting</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => handleDraft("")}
                disabled={pending}
              >
                Inherit
              </Button>
            )}
          </div>

          {/* Side by side, not stacked: two halves of one decision, and a panel
              tall enough to hold the icon grid *above* a spectrum would run off
              a laptop screen. */}
          <div className="flex items-start gap-4">
            <IconGrid
              value={draftIcon}
              color={previewColor}
              pending={pending}
              onSelect={(name: IconName) => setDraftIcon(name)}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the search box of the grid the panel opens on
              autoFocus
            />
            <div className="flex w-48 shrink-0 flex-col gap-3">
              <PaletteGrid selected={normaliseHex(draft)} pending={pending} onPick={handleDraft} />
              <SpectrumArea hsv={hsv} pending={pending} onChange={moveSpectrum} />
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={fieldId}
                  className="text-gousse-muted text-xs uppercase tracking-wide"
                >
                  Hex colour
                </label>
                <Input
                  id={fieldId}
                  value={draft}
                  onChange={(e) => handleDraft(e.target.value)}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? errorId : undefined}
                  placeholder="#ef4444"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={pending}
                />
                {invalid ? (
                  <p id={errorId} className="text-gousse-high text-xs">
                    Enter a hex colour like #ef4444.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" size="sm" type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
