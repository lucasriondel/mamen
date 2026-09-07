import type { Account } from "@mamen/shared/contract";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { resolveAccountColor } from "../accounts/account-color";

export interface AccountFilterPickerProps {
  accounts: readonly Account[];
  /** The selected ids; empty means **all accounts** — the resting state. */
  selected: readonly number[];
  onChange: (selected: number[]) => void;
}

/**
 * The transactions bar's **account** filter: a popover of checkboxes, one per
 * account, each painted in that account's own colour.
 *
 * The colour is the point. `AccountBadge` already paints every account in its
 * `color` (or the stable auto colour derived from its id — see
 * `resolveAccountColor`), so the table's rows are colour-coded while the filter
 * that narrows them was a list of identical grey checkboxes. Carrying the same
 * mark here lets the eye connect "the blue rows" to the blue entry, and the
 * ticked box adopts the account's colour so the panel reads as a list of
 * accounts rather than a list of generic controls.
 *
 * An empty selection is the absent filter, not an empty result — the rule the
 * previous control implemented and never stated. It is written under the list
 * now, because "nothing ticked" is otherwise as easily read as "nothing shown".
 */
export function AccountFilterPicker({ accounts, selected, onChange }: AccountFilterPickerProps) {
  const selectedSet = new Set(selected);

  const toggle = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  // The colours of what is selected, for the trigger's stacked swatches. Capped
  // at three: past that the stack is a smear rather than a set of identities,
  // and the count beside it already carries the number.
  const selectedAccounts = accounts.filter((account) => selectedSet.has(account.id));
  const swatches = selectedAccounts.slice(0, 3);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="secondary"
            aria-label="Filter by account"
            className="h-8 gap-2 border-transparent bg-transparent px-3 hover:bg-gousse-line/40"
          >
            {swatches.length > 0 ? (
              <span aria-hidden className="flex items-center">
                {swatches.map((account, index) => (
                  <span
                    key={account.id}
                    className={cn(
                      "size-2.5 rounded-[3px] ring-1 ring-black/[0.06]",
                      index > 0 && "-ml-1",
                    )}
                    style={{ backgroundColor: resolveAccountColor(account) }}
                  />
                ))}
              </span>
            ) : null}
            <span>{triggerLabel(selectedAccounts)}</span>
            <ChevronDown size={14} className="text-gousse-muted" aria-hidden />
          </Button>
        }
      />

      <PopoverContent className="w-64 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
          <span className="text-[11px] tracking-wider text-gousse-muted uppercase">Accounts</span>
          {selectedSet.size > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="cursor-pointer rounded-full px-1.5 py-0.5 text-xs text-gousse-accent outline-none hover:bg-gousse-accent/10 focus-visible:ring-2 focus-visible:ring-gousse-accent"
            >
              Clear
            </button>
          ) : null}
        </div>

        {accounts.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-gousse-muted">No accounts</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {accounts.map((account) => {
              const checked = selectedSet.has(account.id);
              const color = resolveAccountColor(account);
              return (
                <label
                  key={account.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-full px-2 py-1.5 text-sm text-gousse-ink hover:bg-gousse-line/35"
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggle(account.id)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-[17px] shrink-0 items-center justify-center rounded-md border-[1.5px] text-white transition-colors",
                      !checked && "border-gousse-line",
                    )}
                    // The tick adopts the account's own colour, so the control
                    // and the rows it isolates carry one mark.
                    style={checked ? { backgroundColor: color, borderColor: color } : undefined}
                  >
                    {checked ? <Check size={11} strokeWidth={3.5} /> : null}
                  </span>
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[3px] ring-1 ring-black/[0.06]"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{account.name}</span>
                </label>
              );
            })}
          </div>
        )}

        <p className="mt-1.5 border-t border-gousse-line px-2 pt-1.5 text-xs text-gousse-muted">
          Nothing selected shows every account.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** The trigger text: "All accounts" when unfiltered, the name when one, else a count. */
function triggerLabel(selected: readonly Account[]): string {
  if (selected.length === 0) return "All accounts";
  if (selected.length === 1) return selected[0]?.name ?? "1 account";
  return `${selected.length} accounts`;
}
