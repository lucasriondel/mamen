import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for a single issuer's routes — the detail page (`/issuers/$issuerId`)
 * and its rule create/edit pages (`/issuers/$issuerId/rules/*`). It only renders
 * the matched child so each surface is its own full page rather than stacking
 * the form beneath the detail view.
 */
export const Route = createFileRoute("/issuers/$issuerId")({
	component: Outlet,
});
