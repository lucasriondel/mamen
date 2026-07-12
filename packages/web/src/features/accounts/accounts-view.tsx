/**
 * Accounts view (stub).
 *
 * Minimal account CRUD (list, create, rename, delete-when-empty) is built in a
 * later slice. For now it renders a heading under the app shell.
 */
export function AccountsView() {
	return (
		<section>
			<h1 className="text-2xl font-semibold text-ink">Accounts</h1>
			<p className="mt-2 text-muted">Manage your accounts here.</p>
		</section>
	);
}
