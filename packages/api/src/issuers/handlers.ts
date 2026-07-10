import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { deleteIssuerImage, persistIssuerImage } from "./image";
import { IssuerRepo } from "./repository";

/**
 * Implements the `issuers` group of the contract on {@link IssuerRepo}.
 *
 * The two image endpoints compose the repo with the filesystem helper: both
 * `getById` first (so a missing issuer 404s before any file work), then move /
 * clear the image file, then set / clear the `imageUrl` column and return the
 * updated `Issuer`. The `FileSystem`/`Path` requirement introduced by the
 * image helper is satisfied by the server layer (`BunContext` in prod,
 * `NodeContext` under the test server) — it is NOT provided here.
 */
export const IssuersLive = HttpApiBuilder.group(
	Api,
	"issuers",
	(handlers) =>
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
							persistIssuerImage(
								_.path.id,
								_.payload.file,
								issuer.imageUrl,
							),
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
				);
		}),
).pipe(Layer.provide(IssuerRepo.Default));
