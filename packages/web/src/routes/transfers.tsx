import { createFileRoute } from "@tanstack/react-router";
import { TransfersView } from "@/features/transfers/transfers-view";

export const Route = createFileRoute("/transfers")({
	component: TransfersView,
});
