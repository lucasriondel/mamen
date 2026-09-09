import { createFileRoute } from "@tanstack/react-router";
import { CategoriesView } from "@/features/categories/categories-view";

/**
 * The categories tree page (PRD #19) — lists the two-level tree, every node a
 * link to its transactions page (issue #25).
 */
export const Route = createFileRoute("/categories/")({
  component: CategoriesView,
});
