import { createFileRoute } from "@tanstack/react-router";
import { CategoriesView } from "@/features/categories/categories-view";

/**
 * The categories route — lists the seeded two-level tree (issue #21). Read-only
 * for now; totals, CRUD and the category page land in later slices.
 */
export const Route = createFileRoute("/categories")({
	component: CategoriesView,
});
