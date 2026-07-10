import {
	HttpApiBuilder,
	HttpRouter,
	HttpServerResponse,
	Path,
} from "@effect/platform";
import { Effect } from "effect";
import { UploadsDir } from "../config";

/**
 * Serves the `uploads/` directory at `/uploads/*` on the same Bun router as the
 * API (uploads research). `HttpApiBuilder.Router` is an `HttpRouter.Tag`, so a
 * raw wildcard route mounts alongside the HttpApi groups. On bun,
 * `HttpServerResponse.file` routes through `Bun.file` — zero-copy, auto
 * content-type, automatic etag / last-modified.
 *
 * This is deliberately NOT part of the HttpApi contract: the contract owns the
 * merchant image upload / delete endpoints, but the static file surface is a
 * plain route (no schema, no OpenAPI entry).
 *
 * **Path-traversal guard.** The old `@fastify/static` sanitized `..` for us; the
 * wildcard param must be guarded here. We resolve the requested path against the
 * uploads root and 404 anything that escapes it (`..`, absolute paths), so a
 * request can never read a file outside `uploads/`. A missing file also 404s
 * (the `HttpServerResponse.file` failure is mapped to a not-found response).
 */
export const StaticUploadsLive = HttpApiBuilder.Router.use((router) =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		// Default-backed config; a read failure is a misconfiguration defect.
		const uploadsDir = yield* Effect.orDie(UploadsDir);
		const root = path.resolve(uploadsDir);

		yield* router.get(
			"/uploads/*",
			Effect.gen(function* () {
				const { params } = yield* HttpRouter.RouteContext;
				const requested = params["*"] ?? "";
				const resolved = path.resolve(root, requested);

				// Reject anything that resolves outside the uploads root: `..`
				// sequences, absolute paths, symlink-style escapes. `resolved` must
				// be `root` itself or sit strictly beneath it.
				const escapes =
					resolved !== root && !resolved.startsWith(`${root}${path.sep}`);
				if (escapes) {
					return yield* HttpServerResponse.empty({ status: 404 });
				}

				return yield* HttpServerResponse.file(resolved).pipe(
					// A missing / unreadable file is a 404, not a 500 — the platform
					// error carries a disk path we must not leak.
					Effect.catchAll(() => HttpServerResponse.empty({ status: 404 })),
				);
			}),
		);
	}),
);
