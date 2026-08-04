import type { AccountId } from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatMonth } from "@/lib/format";
import { accountKeys, ruleKeys, transactionKeys } from "@/lib/sdk";
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
 * The import commit mutation. Runs {@link commitImport} (delete-then-create per
 * month), then — per the PRD — invalidates the transactions and accounts query
 * families (plus rules, whose owned counts are derived from the rows that just
 * moved), raises a success toast, and navigates to the transactions view.
 * Failures (bad file already filtered out; network errors here) surface via a
 * `sonner` error toast keyed off the SDK tagged error.
 */
export function useImportCommit() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	return useMutation({
		mutationFn: ({
			records,
			accountId,
		}: {
			records: readonly ParsedTransaction[];
			accountId: AccountId;
		}) => commitImport(records, accountId),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: transactionKeys.all });
			queryClient.invalidateQueries({ queryKey: accountKeys.all });
			// A rule's `ownedCount` is derived from the live table (issue #63), and
			// an import moves it both ways: the month's old rows are deleted and the
			// new ones are claimed by whichever rules match them at import time.
			queryClient.invalidateQueries({ queryKey: ruleKeys.all });
			toast.success(successMessage(result));
			navigate({ to: "/transactions" });
		},
		onError: (error) => {
			toast.error(toErrorMessage(error));
		},
	});
}
