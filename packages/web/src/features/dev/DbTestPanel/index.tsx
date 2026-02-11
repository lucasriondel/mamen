import { useQuery } from "@tanstack/react-query";
import { accountsApi, queryKeys, transactionsApi } from "@/lib/api";
import type { Account } from "@/types";

export function DbTestPanel(): React.ReactElement {
	const { data: accounts } = useQuery({
		queryKey: queryKeys.accounts.all,
		queryFn: () => accountsApi.getAll(),
	});
	const { data: transactions } = useQuery({
		queryKey: queryKeys.transactions.list({}),
		queryFn: () => transactionsApi.getAll(),
	});

	const handleAddTestAccount = async (): Promise<void> => {
		await accountsApi.create({
			name: `Test Account ${Date.now()}`,
			type: "checking",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	};

	const handleAddTestTransaction = async (): Promise<void> => {
		const allAccounts = await accountsApi.getAll();
		const firstAccount = allAccounts[0];
		if (!firstAccount?.id) return;

		await transactionsApi.create({
			accountId: firstAccount.id,
			date: new Date(),
			amount: -(Math.random() * 100).toFixed(2) as unknown as number,
			rawMerchantString: `TEST_MERCHANT_${Date.now()}`,
			importedAt: new Date(),
			importMonth: new Date().toISOString().slice(0, 7),
		});
	};

	const handleClearAll = async (): Promise<void> => {
		const allAccounts = await accountsApi.getAll();
		for (const account of allAccounts) {
			await accountsApi.delete(account.id!);
		}
		const allTransactions = await transactionsApi.getAll();
		await transactionsApi.bulkDelete(allTransactions.map((t) => t.id!));
	};

	return (
		<div style={{ padding: "1rem", fontFamily: "monospace", fontSize: "14px" }}>
			<h2>DB Test Panel (Dev Only)</h2>
			<p>
				Use this to verify IndexedDB persistence across browser refresh/close.
			</p>

			<div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
				<button onClick={handleAddTestAccount}>Add Test Account</button>
				<button onClick={handleAddTestTransaction}>Add Test Transaction</button>
				<button onClick={handleClearAll}>Clear All</button>
			</div>

			<h3>Accounts ({accounts?.length ?? "..."})</h3>
			<ul>
				{accounts?.map((a: Account) => (
					<li key={a.id}>
						[{a.id}] {a.name} ({a.type})
					</li>
				))}
			</ul>

			<h3>Transactions ({transactions?.length ?? "..."})</h3>
			<ul>
				{transactions?.map((t) => (
					<li key={t.id}>
						[{t.id}] Account#{t.accountId} — {t.rawMerchantString} — ${t.amount}
					</li>
				))}
			</ul>
		</div>
	);
}
