import type { Account } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { transactionQueries } from "@/lib/sdk";
import { AccountActionsMenu } from "./account-actions-menu";
import { resolveAccountColor } from "./account-color";
import { AccountColorPicker } from "./account-color-picker";
import { AccountMonthStrip } from "./account-month-strip";
import { accountTypeLabel } from "./account-type";
import { type MonthCellSpec, monthProgress } from "./month-grid";
import { useAccountMutations } from "./use-account-mutations";

export interface AccountCardProps {
  account: Account;
  /** The year the strip shows — the page's year pager owns it. */
  year: number;
  /** This account's twelve cells for that year (`monthCells()`). */
  cells: readonly MonthCellSpec[];
}

/**
 * One account, as a card that owns its own year of imports (issue #131).
 *
 * The page used to be two blocks that both enumerated every account — a list of
 * name-and-buttons rows, then an `Import statements` matrix repeating the same
 * names down its left edge. Answering "is this account behind?" meant reading one
 * against the other. The card is the join: identity, stat, coverage and actions
 * in one object, so the question is answered by looking at it.
 *
 * The reading order is deliberate. The **swatch** anchors it (and is still the
 * recolour surface — the colour is changed where it is read), then the name and
 * type, then the transaction count *as a stat*: it used to be error text welded
 * to a disabled Delete — `137 transactions — clear them to delete` — permanently
 * explaining a button nobody had pressed. Rename and Delete are behind the `···`
 * menu, which is also where that explanation now lives, at the moment it answers
 * something.
 *
 * The delete guard survives that move: it is re-checked here, not just rendered
 * as a disabled item, because the API's `remove` does not check for referencing
 * transactions and a guard that only exists in the menu's props is a guard one
 * refactor from being gone.
 */
export function AccountCard({ account, year, cells }: AccountCardProps) {
  const { rename, recolor, remove } = useAccountMutations();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(account.name);

  const countQuery = useQuery(transactionQueries.count({ accountId: account.id }));
  const transactionCount = countQuery.data?.count ?? 0;
  const hasTransactions = transactionCount > 0;

  const progress = monthProgress(cells);

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (trimmed.length === 0 || rename.isPending) return;
    if (trimmed === account.name) {
      setEditing(false);
      return;
    }
    rename.mutate({ id: account.id, name: trimmed }, { onSuccess: () => setEditing(false) });
  };

  const handleDelete = () => {
    // Guard: never orphan transactions. The menu item is disabled in this
    // state, but re-check here so the guard holds however delete is reached.
    if (hasTransactions || remove.isPending) return;
    remove.mutate(account.id);
  };

  return (
    <li className="flex flex-col gap-3.5 rounded-2xl border border-gousse-line bg-gousse-panel p-4">
      {editing ? (
        <form onSubmit={handleRename} className="flex flex-wrap items-center gap-2">
          <Input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            aria-label="New account name"
            className="max-w-56"
            // Focus the field the user just opened from the menu — the menu
            // returns focus to its trigger otherwise, and the rename would
            // start with a click already spent.
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field the user just opened from the menu, per the note above
            autoFocus
          />
          <Button type="submit" variant="primary" size="sm" disabled={rename.isPending}>
            Save
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraftName(account.name);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* The swatch paints the *resolved* colour, so an account that has
              never been recoloured still shows what its badge looks like. */}
          <AccountColorPicker
            label={account.name}
            value={account.color}
            resolved={resolveAccountColor(account)}
            pending={recolor.isPending}
            onSubmit={(color) => recolor.mutate({ id: account.id, color })}
          />
          <span className="font-semibold text-gousse-ink">{account.name}</span>
          <span className="rounded-full border border-gousse-line px-2 py-0.5 text-gousse-muted text-xs">
            {accountTypeLabel(account.type)}
          </span>
          <span className="text-gousse-muted text-xs tabular-nums">
            {transactionCount} transaction{transactionCount === 1 ? "" : "s"}
          </span>

          <span className="flex-1" />

          {/* Coverage over *elapsed* months, so a caught-up account never reads
              as behind in January. */}
          <span className="text-gousse-muted text-xs tabular-nums">
            {progress.imported}/{progress.importable} months
          </span>
          <AccountActionsMenu
            name={account.name}
            onRename={() => {
              setDraftName(account.name);
              setEditing(true);
            }}
            onDelete={handleDelete}
            blocked={hasTransactions}
            deleting={remove.isPending}
          />
        </div>
      )}

      <AccountMonthStrip
        accountId={account.id}
        accountName={account.name}
        year={year}
        cells={cells}
      />
    </li>
  );
}
