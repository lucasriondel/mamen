import { createFileRoute } from "@tanstack/react-router";
import { CreateIssuerPage } from "@/features/issuers/create-issuer-page";

/**
 * The standalone create-issuer route. Static `/issuers/new` is matched ahead of
 * the dynamic `/issuers/$issuerId` (and `Number("new")` is `NaN` anyway), so the
 * two never collide.
 */
export const Route = createFileRoute("/issuers/new")({
	component: CreateIssuerPage,
});
