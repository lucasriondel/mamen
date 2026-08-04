import { createFileRoute } from "@tanstack/react-router";
import { RecapDetailView } from "@/features/recap/detail/recap-detail-view";
import { validateRecapDetailSearch } from "@/features/recap/detail/search";

/**
 * The **recap detail** route (issue #86) — the transactions behind one recap row.
 *
 * Its typed search params are the union of the recap's (period, account selection)
 * and the transactions view's (filter bar, date sort, page), plus the target
 * itself (`by` + `bucket`), so a drill-down is a bookmarkable URL and the rows it
 * lists are exactly the rows the recap row it came from counted. A top-level route
 * rather than a child of `/recap`: it replaces that page rather than nesting
 * inside it, and its target is a pair (axis + bucket) that no single path param
 * names. The view reads the params and owns its queries (no Router loader).
 */
export const Route = createFileRoute("/recap-detail")({
	validateSearch: validateRecapDetailSearch,
	component: RecapDetailView,
});
