import { createFileRoute } from "@tanstack/react-router";
import { IssuersView } from "@/features/issuers/issuers-view";

export const Route = createFileRoute("/issuers/")({
	component: IssuersView,
});
