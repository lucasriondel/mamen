import type { Issuer } from "@mamen/shared/contract";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssuerDefaultCategoryPicker } from "./issuer-default-category-picker";
import { IssuerNotesSummary } from "./issuer-notes-summary";
import { IssuerRecapChip } from "./issuer-recap-chip";

export interface IssuerDetailHeaderProps {
  issuer: Issuer;
  /** Rows in the *filtered* set — what the net beside it describes. */
  count: number;
  net: number;
  onToggleRecap: (excluded: boolean) => void;
  recapBusy?: boolean;
}

/**
 * The detail page's **hero body**: the note, the two switchable settings, and
 * the money — everything under the title row.
 *
 * The old header was a title and a count line, followed by a stack of controls —
 * three image buttons, a category picker, a notes textarea, a recap section —
 * each at the same weight, all of them above the transactions. This is the same
 * information ranked: the note as the page's sentence — editable in place, like
 * the name above it — the two states worth changing as chips, the net at the
 * weight of the number it is, and everything rare behind the avatar's menu up in
 * the title row.
 *
 * The **name and avatar are not here**: they go to {@link PageLayout}'s title
 * slot, which owns the app's only page heading and the sidebar-reopen trigger
 * beside it (issue #125). A page that hand-rolls its own heading is how one ends
 * up with a different title size or no trigger, so this renders strictly below.
 */
export function IssuerDetailHeader({
  issuer,
  count,
  net,
  onToggleRecap,
  recapBusy,
}: IssuerDetailHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-56 flex-1 flex-col gap-2">
        <IssuerNotesSummary issuer={issuer} />

        <div className="flex flex-wrap items-center gap-2">
          <IssuerDefaultCategoryPicker issuer={issuer} triggerClassName="self-auto" />
          <IssuerRecapChip issuer={issuer} onToggle={onToggleRecap} busy={recapBusy} />
        </div>
      </div>

      {/* The number the page is usually opened to check, given the weight of a
          heading rather than a line of small print under the title. */}
      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="text-gousse-muted text-xs uppercase tracking-wide">Net</span>
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            net < 0 && "text-gousse-high",
            net > 0 && "text-gousse-low",
          )}
        >
          {formatCurrency(net)}
        </span>
        <span className="text-gousse-muted text-sm tabular-nums">
          {count} transaction{count === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
