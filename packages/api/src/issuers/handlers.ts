import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { fetchGuarded } from "../net/guarded-fetch";
import {
	deleteIssuerImage,
	persistIssuerImage,
	persistIssuerImageFromBytes,
} from "./image";
import { IssuerRepo } from "./repository";
import { searchLogos } from "./search";

/**
 * Implements the `issuers` group of the contract on {@link IssuerRepo}.
 *
 * The image endpoints compose the repo with the filesystem helper: all of them
 * `getById` first (so a missing issuer 404s before any file work), then move /
 * clear the image file, then set / clear the `imageUrl` column and return the
 * updated `Issuer`. The `FileSystem`/`Path` requirement introduced by the
 * image helper is satisfied by the server layer (`BunContext` in prod,
 * `NodeContext` under the test server) — it is NOT provided here.
 *
 * The two **Logo search** endpoints (ADR 0007) add an `Outbound` requirement,
 * left unprovided here for the same reason: `OutboundLive` in prod, a stub
 * network under test — which is the only way the SSRF guards are testable at
 * all (see `net/outbound.ts`).
 */
export const IssuersLive = HttpApiBuilder.group(Api, "issuers", (handlers) =>
	Effect.gen(function* () {
		const repo = yield* IssuerRepo;
		return handlers
			.handle("list", (_) => repo.list(_.urlParams))
			.handle("getById", (_) => repo.getById(_.path.id))
			.handle("getByName", (_) => repo.getByName(_.path.name))
			.handle("getByNameCi", (_) => repo.getByNameCi(_.path.name))
			.handle("create", (_) => repo.create(_.payload))
			.handle("update", (_) => repo.update(_.path.id, _.payload))
			.handle("remove", (_) =>
				// Cascade the image-file cleanup before deleting the row (faithful
				// to the old server): fetch first (404s on miss), unlink the image
				// if any, then delete. The repo stays filesystem-free — the FS side
				// lives here, same split as `deleteImage`.
				repo.getById(_.path.id).pipe(
					Effect.tap((issuer) =>
						issuer.imageUrl !== undefined
							? deleteIssuerImage(issuer.imageUrl)
							: Effect.void,
					),
					Effect.flatMap(() => repo.remove(_.path.id)),
				),
			)
			.handle("uploadImage", (_) =>
				repo.getById(_.path.id).pipe(
					Effect.flatMap((issuer) =>
						persistIssuerImage(_.path.id, _.payload.file, issuer.imageUrl),
					),
					Effect.flatMap((imageUrl) => repo.setImage(_.path.id, imageUrl)),
				),
			)
			.handle("deleteImage", (_) =>
				repo.getById(_.path.id).pipe(
					Effect.tap((issuer) =>
						issuer.imageUrl !== undefined
							? deleteIssuerImage(issuer.imageUrl)
							: Effect.void,
					),
					Effect.flatMap(() => repo.clearImage(_.path.id)),
				),
			)
			.handle("searchLogos", (_) => searchLogos(_.urlParams.q))
			.handle("setImageFromUrl", (_) =>
				// Same shape as `uploadImage`, with `fetchGuarded` where the
				// multipart parser was. `getById` stays first so a request naming
				// an issuer that doesn't exist spends no fetch: this endpoint is
				// unauthenticated (ADR 0007 — auth and rate-limiting deferred), so
				// every avoidable outbound request is one an anonymous caller
				// could have made the server pay for.
				repo.getById(_.path.id).pipe(
					Effect.flatMap((issuer) =>
						fetchGuarded(_.payload.url).pipe(
							Effect.flatMap((bytes) =>
								persistIssuerImageFromBytes(_.path.id, bytes, issuer.imageUrl),
							),
						),
					),
					Effect.flatMap((imageUrl) => repo.setImage(_.path.id, imageUrl)),
				),
			);
	}),
).pipe(Layer.provide(IssuerRepo.Default));
