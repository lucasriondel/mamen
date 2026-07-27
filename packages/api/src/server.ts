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
import { DatabaseLive } from "./db/sql";
import { ClaudeCodeProdLive } from "./import/claude";
import { OutboundLive } from "./net/outbound";
import { StaticUploadsLive } from "./static/uploads";

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
 * the OpenAPI spec at `/api/openapi.json`, the `/uploads/*` static route, CORS,
 * and the API itself, served on a Bun HTTP server whose port comes from config.
 *
 * `StaticUploadsLive` is provided to `serve` directly (it mutates the served
 * `Router`, like `middlewareOpenApi`) rather than through `ApiLive`. Its
 * `FileSystem`/`Path` requirement is satisfied by `BunServerLive` (BunContext).
 *
 * `OutboundLive` is the real network for the **Logo search** endpoints (ADR
 * 0007) — the platform `fetch` and the OS resolver. This is the *only* place it
 * is bound; every test binds a stub instead, which is what makes the SSRF
 * guards testable.
 */
export const ServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
	Layer.provide(HttpApiScalar.layer({ path: "/docs" })),
	Layer.provide(
		HttpApiBuilder.middlewareOpenApi({ path: "/api/openapi.json" }),
	),
	Layer.provide(StaticUploadsLive),
	Layer.provide(CorsLive),
	Layer.provide(ApiLive),
	Layer.provide(ClaudeCodeProdLive),
	Layer.provide(OutboundLive),
	Layer.provide(DatabaseLive),
	HttpServer.withLogAddress,
	Layer.provide(BunServerLive),
);
