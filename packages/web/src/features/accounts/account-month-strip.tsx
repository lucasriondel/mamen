import type { AccountId } from "@mamen/shared/contract";
import { MonthCell } from "./month-cell";
import type { MonthCellSpec } from "./month-grid";

export interface AccountMonthStripProps {
  accountId: AccountId;
  /** Names the group — the cells carry only their month. */
  accountName: string;
  /** The year the strip shows, part of the group's name. */
  year: number;
  /** The twelve cells, already derived — see `monthCells()`. */
  cells: readonly MonthCellSpec[];
}

/**
 * One account's twelve months, laid across its card (issue #131).
 *
 * This is the accounts × months grid cut into rows. The grid put every account's
 * name in a left-hand column and repeated the names the list above it had
 * already given, so "is this account behind?" meant reading two regions of the
 * page against each other. A strip per card asks nothing of the eye: the
 * account, its stat and its coverage are one object.
 *
 * `role="group"` named for the account *and* the year, because that pair is the
 * only context a cell doesn't carry itself — the year pager can move the whole
 * page under a screen reader without any individual cell changing its shape.
 *
 * The cells are handed in rather than derived here: the card above reads the
 * same list to count `3/7 months`, and deriving it twice is how the stat and the
 * strip would come to disagree.
 */
export function AccountMonthStrip({ accountId, accountName, year, cells }: AccountMonthStripProps) {
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a `fieldset` is for form controls, and its legend cannot be a grid item; this is twelve links-into-the-app that need one shared name
      role="group"
      aria-label={`${accountName} — ${year}`}
      className="grid grid-cols-6 gap-1 sm:grid-cols-12"
    >
      {cells.map((cell) => (
        <MonthCell
          key={cell.month}
          accountId={accountId}
          month={cell.month}
          label={cell.label}
          state={cell.state}
        />
      ))}
    </div>
  );
}
