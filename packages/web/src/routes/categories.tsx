import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * The `/categories` layout. Its index (`categories.index.tsx`) is the tree page;
 * `categories.$categoryId.tsx` is a node's transactions page (issue #25). This
 * route only hosts the shared `<Outlet />` so the two render in the same slot.
 */
export const Route = createFileRoute("/categories")({
	component: Outlet,
});
