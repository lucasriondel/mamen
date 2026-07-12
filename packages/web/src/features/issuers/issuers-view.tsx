/**
 * Issuers view (stub).
 *
 * The card grid (avatar, name, transaction count, net € total) and the edit
 * dialog are built in a later slice. For now it renders a heading under the app
 * shell.
 */
export function IssuersView() {
	return (
		<section>
			<h1 className="text-2xl font-semibold text-ink">Issuers</h1>
			<p className="mt-2 text-muted">Your issuers will appear here.</p>
		</section>
	);
}
