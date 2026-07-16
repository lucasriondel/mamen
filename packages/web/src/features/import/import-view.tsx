import type { AccountId } from "@mamen/shared/contract";
import { getRouteApi } from "@tanstack/react-router";
import { ImportWizard } from "./import-wizard";

const routeApi = getRouteApi("/import");

/**
 * Import view — the CSV import surface (PRD #7).
 *
 * Thin wrapper around the {@link ImportWizard}: the whole 3-step flow (file drop
 * + parser auto-detect + account selection, mandatory preview, idempotent
 * commit) lives in the wizard so the route stays a one-liner. When reached from
 * the accounts import grid, the route carries an `accountId` search param that
 * pre-selects the wizard's target account.
 */
export function ImportView() {
	const { accountId } = routeApi.useSearch();
	return <ImportWizard initialAccountId={accountId as AccountId | undefined} />;
}
