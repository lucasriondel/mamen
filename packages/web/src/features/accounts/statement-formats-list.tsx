import type { AccountId, StatementFormat, StatementFormatId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Empty } from "@/components/ui/empty";
import { statementFormatQueries } from "@/lib/sdk";
import { StatementFormatDeleteDialog } from "./statement-format-delete-dialog";
import { StatementFormatRow } from "./statement-format-row";
import { StatementFormatsSkeleton } from "./statement-formats-skeleton";
import { useStatementFormatMutations } from "./use-statement-format-mutations";

export interface StatementFormatsListProps {
  accountId: AccountId;
  /** Named in the empty state, which is about *this* account's imports. */
  accountName: string;
}

/**
 * How many formats one account's list asks for. Well past any real count — a
 * format is authored once per bank export shape, so an account with more than a
 * handful has a different problem than pagination.
 */
const FORMAT_LIMIT = 100;

/**
 * The formats an account can read statements with, and the two things that can
 * be done to one.
 *
 * Owns the delete confirmation rather than delegating it to each row, because a
 * dialog mounted inside a row unmounts with that row the instant the delete
 * succeeds — taking its own closing animation with it. Held here, the pending
 * format is a piece of list state and the dialog outlives the row it names.
 */
export function StatementFormatsList({ accountId, accountName }: StatementFormatsListProps) {
  const [pendingDelete, setPendingDelete] = useState<StatementFormat | null>(null);
  const [renamingId, setRenamingId] = useState<StatementFormatId | null>(null);

  const { rename, remove } = useStatementFormatMutations();

  const formatsQuery = useQuery(statementFormatQueries.list({ accountId, limit: FORMAT_LIMIT }));

  if (formatsQuery.isPending) return <StatementFormatsSkeleton />;

  if (formatsQuery.isError) {
    return (
      <Empty
        variant="dashed"
        title="Couldn't load formats"
        description="The list didn't come back. Close this and try again."
      />
    );
  }

  const formats = formatsQuery.data.items;

  if (formats.length === 0) {
    return (
      <Empty
        variant="dashed"
        icon={<FileText className="size-6" aria-hidden />}
        title="No statement formats yet"
        description={`Importing a file into ${accountName} saves the way it was read, and it shows up here.`}
      />
    );
  }

  const handleRename = (id: StatementFormatId, name: string) => {
    setRenamingId(id);
    rename.mutate({ id, name }, { onSettled: () => setRenamingId(null) });
  };

  const confirmDelete = () => {
    if (pendingDelete === null) return;
    // Close first: the row is about to go, and a dialog naming a deleted format
    // while the list refetches underneath it reads as a failed delete.
    const id = pendingDelete.id;
    setPendingDelete(null);
    remove.mutate(id);
  };

  return (
    <>
      <ul className="flex max-h-80 flex-col divide-y divide-gousse-line overflow-y-auto">
        {formats.map((format) => (
          <StatementFormatRow
            key={format.id}
            format={format}
            renaming={renamingId === format.id}
            deleting={remove.isPending && remove.variables === format.id}
            onRename={(name) => handleRename(format.id, name)}
            onDelete={() => setPendingDelete(format)}
          />
        ))}
      </ul>

      <StatementFormatDeleteDialog
        format={pendingDelete}
        busy={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
