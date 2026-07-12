/**
 * Transactions view (stub).
 *
 * The app opens here. The full table — paginated, filterable by account/month,
 * with the issuer-assignment curation surface — is built in a later slice
 * (#4). For now it renders a heading under the app shell.
 */
export function TransactionsView() {
	return (
		<section>
			<h1 className="text-2xl font-semibold text-ink">Transactions</h1>
			<p className="mt-2 text-muted">Your transactions will appear here.</p>
		</section>
	);
}
