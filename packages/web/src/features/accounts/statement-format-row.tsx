import type { StatementFormat } from "@mamen/shared/contract";
import { useState } from "react";
import { readColumns } from "./statement-format-columns";
import { StatementFormatActionsMenu } from "./statement-format-actions-menu";
import { StatementFormatRenameForm } from "./statement-format-rename-form";

export interface StatementFormatRowProps {
  format: StatementFormat;
  /** This row's rename is in flight. */
  renaming: boolean;
  /** This row's delete is in flight. */
  deleting: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}

/** `31 Jan 2026` — the same short, unambiguous form the month strip uses. */
const createdOn = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * One format in the dialog's list: what it is called, what kind of file it
 * reads, when it was made, and which columns it goes looking for.
 *
 * The columns are here in place of a usage count. A count would be the more
 * obvious thing to show before a delete — "used 0 times" makes the decision for
 * you — but no such number exists: a transaction records the batch it arrived
 * in, never the format that parsed it, so there is nothing to count. The columns
 * answer the question that is actually being asked, which is *which of these two
 * is the junk one*, and they answer it without a schema change.
 *
 * The confirmation for the delete lives in the list, not here: a dialog opened
 * from inside a row would unmount with the row it belongs to the moment the
 * delete succeeds.
 */
export function StatementFormatRow({
  format,
  renaming,
  deleting,
  onRename,
  onDelete,
}: StatementFormatRowProps) {
  const [editing, setEditing] = useState(false);

  const columns = readColumns(format);

  const handleRename = (name: string) => {
    // Nothing moved — close without spending a write, as the account card does.
    if (name === format.name) {
      setEditing(false);
      return;
    }
    onRename(name);
    setEditing(false);
  };

  return (
    <li className="flex flex-col gap-1.5 py-3">
      {editing ? (
        <StatementFormatRenameForm
          currentName={format.name}
          pending={renaming}
          onSubmit={handleRename}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-semibold text-gousse-ink">{format.name}</span>
          <span className="rounded-full border border-gousse-line px-2 py-0.5 text-gousse-muted text-xs uppercase">
            {format.kind}
          </span>
          <span className="text-gousse-muted text-xs tabular-nums">
            {createdOn.format(format.createdAt)}
          </span>

          <span className="flex-1" />

          <StatementFormatActionsMenu
            name={format.name}
            onRename={() => setEditing(true)}
            onDelete={onDelete}
            deleting={deleting}
          />
        </div>
      )}

      {/* Reference data, under the identity row for the reason the card's IBAN
          is: read when someone is working out which format this is, never
          scanned. */}
      <p className="text-gousse-muted text-xs">
        <span className="sr-only">Reads columns: </span>
        {columns.join(" · ")}
      </p>
    </li>
  );
}
