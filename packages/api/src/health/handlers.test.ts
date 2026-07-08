import { HttpApiBuilder, HttpApiClient, OpenApi } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Api, Health } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { HealthLive } from "./handlers";

// The API served on a real ephemeral Node server, with a wired HttpClient —
// the derived client's requests hit the live server, no URL plumbing.
const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(HttpApiBuilder.api(Api).pipe(Layer.provide(HealthLive))),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

describe("health", () => {
	it.effect("GET /api/health round-trips through the derived client", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const result = yield* client.health.check();
			assert.deepStrictEqual(result, new Health({ status: "ok" }));
		}).pipe(Effect.provide(HttpLive)),
	);

	it("is present in the generated OpenAPI spec", () => {
		const spec = OpenApi.fromApi(Api) as {
			paths: Record<string, unknown>;
		};
		assert.ok(spec.paths["/api/health"], "spec exposes /api/health");
	});
});
