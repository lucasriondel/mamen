import type { StatementFormatCreate } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatMonth } from "@/lib/format";
import { accountKeys, ruleKeys, statementFormatKeys, transactionKeys } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";
import { type CommitResult, commitImport } from "./commit";
import type { ParsedTransaction } from "./parsers/types";

/** Success-toast copy: how many rows landed across which month(s). */
function successMessage(result: CommitResult): string {
  const months = result.months.map(formatMonth).join(", ");
  const rows = `${result.count} transaction${result.count === 1 ? "" : "s"}`;
  return `Imported ${rows} (${months}).`;
}

/**
 * The import commit mutation. Runs {@link commitImport} (one bulk insert, no
 * delete), then — per the PRD — invalidates the transactions and accounts query
 * families (plus rules, whose owned counts are derived from the rows that just
 * landed), raises a success toast, and navigates to the transactions view.
 * Failures (bad file already filtered out; network errors here) surface via a
 * `sonner` error toast keyed off the SDK tagged error.
 *
 * The target account is not a variable of the mutation: every parsed row already
 * carries the `accountId` the wizard stamped it with, and with no month to
 * delete there is nothing left for the commit to scope.
 *
 * A **Statement Format** built in the mapping step travels as a second variable
 * and is written by the same action (issue #186) — so the formats family is
 * marked stale too, but only when there was one to save: the picker that would
 * otherwise keep offering the account's old list is the one surface that has to
 * hear about it.
 */
export function useImportCommit() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: ({
      records,
      format,
    }: {
      records: readonly ParsedTransaction[];
      /** The format the user built from this file, if they built one. */
      format?: StatementFormatCreate;
    }) => commitImport(records, format),
    onSuccess: (result, { format }) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all });
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      if (format) queryClient.invalidateQueries({ queryKey: statementFormatKeys.all });
      // A rule's `ownedCount` is derived from the live table (issue #63), and
      // the rows an import lands are claimed by whichever rules match them at
      // import time.
      queryClient.invalidateQueries({ queryKey: ruleKeys.all });
      toast.success(successMessage(result));
      navigate({ to: "/transactions" });
    },
    onError: (error) => {
      toast.error(toErrorMessage(error));
    },
  });
}
