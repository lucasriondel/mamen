import type { Account } from "@mamen/shared/contract";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { accountQueries } from "@/lib/sdk";
import { AccountRow } from "./account-row";
import { AccountsListSkeleton } from "./accounts-list-skeleton";
import { CreateAccountForm } from "./create-account-form";
import { ImportGrid } from "./import-grid";

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
		<PageLayout
			title="Accounts"
			description="The accounts your statements belong to."
			className="mx-auto max-w-4xl gap-8"
		>
			<CreateAccountForm />

			<AccountsList query={accountsQuery} />

			<ImportGrid />
		</PageLayout>
	);
}

/** Body of the view: loading / error / empty / list, driven by the list query. */
function AccountsList({
	query,
}: {
	query: UseQueryResult<{ items: readonly Account[]; total: number }>;
}) {
	if (query.isPending) {
		return <AccountsListSkeleton />;
	}

	if (query.isError) {
		return (
			<div className="rounded-2xl border border-gousse-line bg-gousse-panel p-6 text-center">
				<p className="font-medium text-gousse-ink">
					Couldn't load your accounts.
				</p>
				<Button
					variant="secondary"
					size="sm"
					className="mt-3"
					onClick={() => query.refetch()}
				>
					Try again
				</Button>
			</div>
		);
	}

	if (query.data.items.length === 0) {
		return (
			<div className="rounded-2xl border border-gousse-line bg-gousse-panel p-6 text-center text-gousse-muted">
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
