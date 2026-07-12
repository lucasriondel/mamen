/**
 * Import view (stub).
 *
 * The 3-step CSV import wizard (parser auto-detect, preview, idempotent commit)
 * is built in a later slice. For now it renders a heading under the app shell.
 */
export function ImportView() {
	return (
		<section>
			<h1 className="text-2xl font-semibold text-ink">Import</h1>
			<p className="mt-2 text-muted">Drop a CSV statement to import it.</p>
		</section>
	);
}
