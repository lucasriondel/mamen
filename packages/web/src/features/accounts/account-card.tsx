import type { Account } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { transactionQueries } from "@/lib/sdk";
import { AccountActionsMenu } from "./account-actions-menu";
import { resolveAccountColor } from "./account-color";
import { AccountColorPicker } from "./account-color-picker";
import { AccountEditForm } from "./account-edit-form";
import { formatIban } from "./account-iban";
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
 * explaining a button nobody had pressed. Edit and Delete are behind the `···`
 * menu, which is also where that explanation now lives, at the moment it answers
 * something. The **IBAN**, when there is one, sits under that row: it is
 * reference data someone reads while checking *which* account this is, so it
 * belongs on the card but not in the line the eye scans.
 *
 * The delete guard survives that move: it is re-checked here, not just rendered
 * as a disabled item, because the API's `remove` does not check for referencing
 * transactions and a guard that only exists in the menu's props is a guard one
 * refactor from being gone.
 */
export function AccountCard({ account, year, cells }: AccountCardProps) {
  const { edit, recolor, remove } = useAccountMutations();
  const [editing, setEditing] = useState(false);

  const countQuery = useQuery(transactionQueries.count({ accountId: account.id }));
  const transactionCount = countQuery.data?.count ?? 0;
  const hasTransactions = transactionCount > 0;

  const progress = monthProgress(cells);

  const handleEdit = (changes: { name: string; iban: string | null }) => {
    // Nothing moved — close without spending a write. The IBAN is compared
    // normalised on both sides, so re-grouping the same digits is not an edit.
    if (changes.name === account.name && changes.iban === (account.iban ?? null)) {
      setEditing(false);
      return;
    }
    edit.mutate({ id: account.id, ...changes }, { onSuccess: () => setEditing(false) });
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
        <AccountEditForm
          // Remount per open, so the draft always re-seeds from the account —
          // an edit cancelled and reopened starts from what is stored, not from
          // what was abandoned.
          key={`${account.name}|${account.iban ?? ""}`}
          account={account}
          pending={edit.isPending}
          onSubmit={handleEdit}
          onCancel={() => setEditing(false)}
        />
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
            onEdit={() => setEditing(true)}
            onDelete={handleDelete}
            blocked={hasTransactions}
            deleting={remove.isPending}
          />
        </div>
      )}

      {/* Reference data, so it sits under the identity row rather than in it:
          it is read when someone is checking which account this is, never
          scanned. Grouped in fours and tabular, because comparing it against a
          statement is the only thing anyone does with it. Absent when there is
          none — an empty line would be a field asking to be filled. */}
      {!editing && account.iban ? (
        <p className="text-gousse-muted text-xs tabular-nums">
          <span className="sr-only">IBAN: </span>
          {formatIban(account.iban)}
        </p>
      ) : null}

      <AccountMonthStrip
        accountId={account.id}
        accountName={account.name}
        year={year}
        cells={cells}
      />
    </li>
  );
}
