import { createFileRoute } from "@tanstack/react-router";
import { RecapView } from "@/features/recap/recap-view";
import { validateRecapSearch } from "@/features/recap/search";

/**
 * The recap route (issue #35) — review spending by issuer and category. Owns the
 * typed search-param schema (period, selected accounts, sort) so a filtered
 * recap is a bookmarkable URL. The view reads these params and owns its queries
 * (no Router loader), mirroring the transactions route.
 */
export const Route = createFileRoute("/recap")({
	validateSearch: validateRecapSearch,
	component: RecapView,
});
