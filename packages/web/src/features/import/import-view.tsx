import { ImportWizard } from "./import-wizard";

/**
 * Import view — the CSV import surface (PRD #7).
 *
 * Thin wrapper around the {@link ImportWizard}: the whole 3-step flow (file drop
 * + parser auto-detect + account selection, mandatory preview, idempotent
 * commit) lives in the wizard so the route stays a one-liner.
 */
export function ImportView() {
	return <ImportWizard />;
}
