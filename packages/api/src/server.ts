import {
	HttpApiBuilder,
	HttpApiScalar,
	HttpMiddleware,
	HttpServer,
} from "@effect/platform";
import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { ApiLive } from "./api-live";
import { CorsOrigins, Port } from "./config";

/** CORS layer with allowed origins resolved from config at build time. */
const CorsLive = Layer.unwrapEffect(
	Effect.map(CorsOrigins, (allowedOrigins) =>
		HttpApiBuilder.middlewareCors({
			allowedOrigins,
			allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
			credentials: true,
		}),
	),
);

/** Bun HTTP server layer with the port resolved from config at build time. */
const BunServerLive = Layer.unwrapEffect(
	Effect.map(Port, (port) => BunHttpServer.layer({ port })),
);

/**
 * The full HTTP server layer: request logging, Scalar docs at `/docs`,
 * the OpenAPI spec at `/api/openapi.json`, CORS, and the API itself,
 * served on a Bun HTTP server whose port comes from config.
 */
export const ServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
	Layer.provide(HttpApiScalar.layer({ path: "/docs" })),
	Layer.provide(
		HttpApiBuilder.middlewareOpenApi({ path: "/api/openapi.json" }),
	),
	Layer.provide(CorsLive),
	Layer.provide(ApiLive),
	HttpServer.withLogAddress,
	Layer.provide(BunServerLive),
);
