import type { Account } from "@mamen/shared/contract";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { accountQueries } from "@/lib/sdk";
import { AccountRow } from "./account-row";
import { CreateAccountForm } from "./create-account-form";

/**
 * Accounts view — minimal CRUD over the accounts the user's statements belong to.
 *
 * Reads the accounts list via the SDK `list` query and renders one
 * {@link AccountRow} per account (each owning its own rename + guarded delete);
 * a {@link CreateAccountForm} adds new ones. Per the PRD, a read failure shows an
 * inline error state (writes surface via toast, owned by the mutation hooks).
 */
export function AccountsView() {
	const accountsQuery = useQuery(accountQueries.list());

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8">
			<header>
				<h1 className="text-2xl font-semibold text-ink">Accounts</h1>
				<p className="mt-1 text-muted">
					The accounts your statements belong to.
				</p>
			</header>

			<CreateAccountForm />

			<AccountsList query={accountsQuery} />
		</section>
	);
}

/** Body of the view: loading / error / empty / list, driven by the list query. */
function AccountsList({
	query,
}: {
	query: UseQueryResult<{ items: readonly Account[]; total: number }>;
}) {
	if (query.isPending) {
		return <p className="text-muted">Loading accounts…</p>;
	}

	if (query.isError) {
		return (
			<div className="rounded-md border border-line bg-panel p-6 text-center">
				<p className="font-medium text-ink">Couldn't load your accounts.</p>
				<button
					type="button"
					onClick={() => query.refetch()}
					className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm text-ink"
				>
					Try again
				</button>
			</div>
		);
	}

	if (query.data.items.length === 0) {
		return (
			<div className="rounded-md border border-line bg-panel p-6 text-center text-muted">
				No accounts yet. Add one above to start importing statements.
			</div>
		);
	}

	return (
		<ul className="flex flex-col">
			{query.data.items.map((account) => (
				<AccountRow key={account.id} account={account} />
			))}
		</ul>
	);
}
