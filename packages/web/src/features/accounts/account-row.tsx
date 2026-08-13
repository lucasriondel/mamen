import type { Account } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { transactionQueries } from "@/lib/sdk";
import { resolveAccountColor } from "./account-color";
import { AccountColorPicker } from "./account-color-picker";
import { accountTypeLabel } from "./account-type";
import { useAccountMutations } from "./use-account-mutations";

const INPUT_CLASS =
	"rounded-full border border-gousse-line bg-gousse-bg px-4 py-2 text-sm text-gousse-ink outline-none focus:border-gousse-accent";

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
	const { rename, recolor, remove } = useAccountMutations();
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
		<li className="flex flex-wrap items-center justify-between gap-3 border-b border-gousse-line py-3">
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
					<Button
						type="submit"
						variant="secondary"
						size="sm"
						disabled={rename.isPending}
						className="cursor-pointer"
					>
						Save
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							setDraftName(account.name);
							setEditing(false);
						}}
						className="cursor-pointer"
					>
						Cancel
					</Button>
				</form>
			) : (
				<div className="flex items-center gap-3">
					{/* The swatch is the edit surface: it sits beside the name so the
					    colour is changed where it is read, and it paints the resolved
					    colour so an auto account still shows what its badge looks like. */}
					<AccountColorPicker
						label={account.name}
						value={account.color}
						resolved={resolveAccountColor(account)}
						pending={recolor.isPending}
						onSubmit={(color) => recolor.mutate({ id: account.id, color })}
					/>
					<span className="font-medium text-gousse-ink">{account.name}</span>
					<span className="text-sm text-gousse-muted">
						{accountTypeLabel(account.type)}
					</span>
				</div>
			)}

			{!editing && (
				<div className="flex items-center gap-3">
					{hasTransactions && (
						<span className="text-xs text-gousse-muted">
							{transactionCount} transaction
							{transactionCount === 1 ? "" : "s"} — clear them to delete
						</span>
					)}
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							setDraftName(account.name);
							setEditing(true);
						}}
						className="cursor-pointer"
					>
						Rename
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={handleDelete}
						disabled={hasTransactions || remove.isPending}
						title={
							hasTransactions
								? "This account still has transactions"
								: undefined
						}
						className="cursor-pointer"
					>
						Delete
					</Button>
				</div>
			)}
		</li>
	);
}
