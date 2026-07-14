import { createFileRoute } from "@tanstack/react-router";
import { IssuerDetailPage } from "@/features/issuers/issuer-detail-page";

export const Route = createFileRoute("/issuers/$issuerId/")({
	component: IssuerDetailPage,
});
