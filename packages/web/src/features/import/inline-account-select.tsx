import type { Account, AccountId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
	ACCOUNT_TYPE_OPTIONS,
	type AccountType,
} from "@/features/accounts/account-type";
import { useAccountMutations } from "@/features/accounts/use-account-mutations";
import { accountQueries } from "@/lib/sdk";

const INPUT_CLASS =
	"rounded-full border border-gousse-line bg-gousse-bg px-4 py-2 text-sm text-gousse-ink outline-none focus:border-gousse-accent";

/**
 * Target-account chooser for the import wizard: a `<select>` of existing accounts
 * plus an inline "create account" form so the user never has to leave the flow
 * (PRD user stories 4–5). A freshly created account is auto-selected.
 */
export function InlineAccountSelect({
	value,
	onChange,
}: {
	value: AccountId | null;
	onChange: (accountId: AccountId) => void;
}) {
	const accountsQuery = useQuery(accountQueries.list());
	const { create } = useAccountMutations();
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [type, setType] = useState<AccountType>("checking");

	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];

	const handleCreate = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (trimmed.length === 0 || create.isPending) return;
		create.mutate(
			{ name: trimmed, type },
			{
				onSuccess: (account) => {
					onChange(account.id);
					setName("");
					setType("checking");
					setCreating(false);
				},
			},
		);
	};

	return (
		<div className="flex flex-col gap-3">
			<label className="flex flex-col gap-1 text-sm text-gousse-muted">
				Target account
				<Select
					value={value ?? ""}
					onChange={(event) =>
						onChange(Number(event.target.value) as AccountId)
					}
					aria-label="Target account"
				>
					<option value="" disabled>
						Choose an account…
					</option>
					{accounts.map((account) => (
						<option key={account.id} value={account.id}>
							{account.name}
						</option>
					))}
				</Select>
			</label>

			{creating ? (
				<form
					onSubmit={handleCreate}
					className="flex flex-wrap items-end gap-3 rounded-2xl border border-gousse-line bg-gousse-panel p-3"
					aria-label="Create account"
				>
					<label className="flex flex-col gap-1 text-sm text-gousse-muted">
						Name
						<input
							className={INPUT_CLASS}
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g. Everyday checking"
							aria-label="New account name"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm text-gousse-muted">
						Type
						<Select
							value={type}
							onChange={(event) => setType(event.target.value as AccountType)}
							aria-label="New account type"
						>
							{ACCOUNT_TYPE_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</Select>
					</label>
					<Button
						type="submit"
						variant="primary"
						size="md"
						disabled={create.isPending || name.trim().length === 0}
					>
						Create
					</Button>
					<Button
						variant="secondary"
						size="md"
						onClick={() => setCreating(false)}
					>
						Cancel
					</Button>
				</form>
			) : (
				<button
					type="button"
					onClick={() => setCreating(true)}
					className="self-start text-sm text-gousse-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-gousse-accent rounded-full outline-none"
				>
					+ Create a new account
				</button>
			)}
		</div>
	);
}
