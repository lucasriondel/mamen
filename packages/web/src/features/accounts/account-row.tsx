import type { Account } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { transactionQueries } from "@/lib/sdk";
import { accountTypeLabel } from "./account-type";
import { useAccountMutations } from "./use-account-mutations";

const INPUT_CLASS =
	"rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent";
const BUTTON_CLASS =
	"rounded-md border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-50";

interface AccountRowProps {
	account: Account;
}

/**
 * One account in the list: its name + type, an inline rename, and a guarded
 * delete.
 *
 * The delete guard is client-side by necessity — the API's `remove` does not
 * check for referencing transactions (see the accounts repository), so a naive
 * delete would orphan rows. This row therefore reads the account's transaction
 * count via the SDK `count` query and, when it is non-zero, blocks deletion with
 * an explanation instead of calling the mutation.
 */
export function AccountRow({ account }: AccountRowProps) {
	const { rename, remove } = useAccountMutations();
	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(account.name);

	const countQuery = useQuery(
		transactionQueries.count({ accountId: account.id }),
	);
	const transactionCount = countQuery.data?.count ?? 0;
	const hasTransactions = transactionCount > 0;

	const handleRename = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = draftName.trim();
		if (trimmed.length === 0 || rename.isPending) return;
		if (trimmed === account.name) {
			setEditing(false);
			return;
		}
		rename.mutate(
			{ id: account.id, name: trimmed },
			{ onSuccess: () => setEditing(false) },
		);
	};

	const handleDelete = () => {
		// Guard: never orphan transactions. The button is disabled in this state,
		// but re-check here so the guard holds regardless of how delete is reached.
		if (hasTransactions || remove.isPending) return;
		remove.mutate(account.id);
	};

	return (
		<li className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
			{editing ? (
				<form onSubmit={handleRename} className="flex items-center gap-2">
					<input
						className={INPUT_CLASS}
						value={draftName}
						onChange={(event) => setDraftName(event.target.value)}
						aria-label="New account name"
						// biome-ignore lint/a11y/noAutofocus: focus the field the user just opened
						autoFocus
					/>
					<button
						type="submit"
						disabled={rename.isPending}
						className={BUTTON_CLASS}
					>
						Save
					</button>
					<button
						type="button"
						className={BUTTON_CLASS}
						onClick={() => {
							setDraftName(account.name);
							setEditing(false);
						}}
					>
						Cancel
					</button>
				</form>
			) : (
				<div className="flex items-baseline gap-3">
					<span className="font-medium text-ink">{account.name}</span>
					<span className="text-sm text-muted">
						{accountTypeLabel(account.type)}
					</span>
				</div>
			)}

			{!editing && (
				<div className="flex items-center gap-3">
					{hasTransactions && (
						<span className="text-xs text-muted">
							{transactionCount} transaction
							{transactionCount === 1 ? "" : "s"} — clear them to delete
						</span>
					)}
					<button
						type="button"
						className={BUTTON_CLASS}
						onClick={() => {
							setDraftName(account.name);
							setEditing(true);
						}}
					>
						Rename
					</button>
					<button
						type="button"
						className={BUTTON_CLASS}
						onClick={handleDelete}
						disabled={hasTransactions || remove.isPending}
						title={
							hasTransactions
								? "This account still has transactions"
								: undefined
						}
					>
						Delete
					</button>
				</div>
			)}
		</li>
	);
}
