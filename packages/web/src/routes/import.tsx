import { createFileRoute } from "@tanstack/react-router";
import { ImportView } from "@/features/import/import-view";

export const Route = createFileRoute("/import")({
	component: ImportView,
});
