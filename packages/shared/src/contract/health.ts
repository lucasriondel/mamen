import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";

/** Response body for the health check. */
export class Health extends Schema.Class<Health>("Health")({
	status: Schema.Literal("ok"),
}) {}

/**
 * Health group — the walking-skeleton endpoint proving the full request path
 * (contract → server → derived client → OpenAPI) is wired end-to-end.
 */
export class HealthGroup extends HttpApiGroup.make("health")
	.add(HttpApiEndpoint.get("check", "/health").addSuccess(Health))
	.annotateContext(OpenApi.annotations({ title: "Health" })) {}
