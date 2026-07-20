import { createFileRoute } from "@tanstack/react-router";
import { IssuersView } from "@/features/issuers/issuers-view";
import { validateIssuersSearch } from "@/features/issuers/search";

/**
 * The issuers route. Owns the typed search-param schema — the grid's sort key +
 * direction (issue #41) — so a chosen ordering is a bookmarkable URL. The view
 * reads these params and owns its queries.
 */
export const Route = createFileRoute("/issuers/")({
	validateSearch: validateIssuersSearch,
	component: IssuersView,
});
