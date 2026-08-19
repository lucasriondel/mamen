import type { Issuer } from "@mamen/shared/contract";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

/**
 * The **recap** state as a switchable chip in the page header — the bulk lever
 * from issue #69 / ADR 0008, in the shape the rest of the header speaks.
 *
 * It replaces a section that spent a heading and three paragraphs of prose on a
 * single boolean, above the transactions the page exists to show. The state is
 * the thing worth seeing at rest ("Counted" / "Excluded"), so the chip *is* the
 * readout, and the explanation moves inside the menu — where it is read at the
 * moment the choice is being made rather than every time the page opens.
 *
 * The caveat survives the move, deliberately: a transaction's own
 * `manualExcluded` flag wins over this default, so a row forced out stays out
 * when the issuer comes back in. Without that sentence the lever looks like it
 * overwrites decisions it in fact preserves.
 */
export function IssuerRecapChip({
  issuer,
  onToggle,
  busy = false,
}: {
  issuer: Issuer;
  onToggle: (excluded: boolean) => void;
  busy?: boolean;
}) {
  const isExcluded = issuer.excludedFromRecap === true;

  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            disabled={busy}
            title={
              isExcluded
                ? "This issuer's transactions are held out of spend totals"
                : "This issuer's transactions count toward spend totals"
            }
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-gousse-accent disabled:opacity-50",
              isExcluded
                ? "border-gousse-line text-gousse-muted hover:text-gousse-ink"
                : "border-gousse-low/40 text-gousse-low hover:border-gousse-low/70",
            )}
          >
            {isExcluded ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            {isExcluded ? "Excluded from recap" : "Counted in recap"}
            <ChevronDown size={12} aria-hidden className="opacity-60" />
          </button>
        }
      />
      <MenuContent align="start" className="max-w-72">
        <MenuItem onClick={() => onToggle(false)} disabled={!isExcluded || busy}>
          <Eye className="size-3.5 text-gousse-muted" aria-hidden />
          Count in recap
        </MenuItem>
        <MenuItem onClick={() => onToggle(true)} disabled={isExcluded || busy}>
          <EyeOff className="size-3.5 text-gousse-muted" aria-hidden />
          Exclude from recap
        </MenuItem>
        <p className="px-2.5 pt-1.5 pb-1 text-gousse-muted text-xs">
          {isExcluded
            ? "These transactions stay in the list; only their money is out — including the ones imported from now on."
            : "Exclude them if they aren't really spending — a standing transfer between your own accounts, a savings sweep, an internal movement."}{" "}
          Transactions you have already decided by hand keep their own state.
        </p>
      </MenuContent>
    </Menu>
  );
}
