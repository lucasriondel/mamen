import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { SecretsRepo } from "./repository";

/**
 * Implements the `secrets` group of the contract on {@link SecretsRepo}:
 * `status`, `put` (upsert, refuses a blank or too-short paste) and `clear`
 * (idempotent). Each handler is a thin delegate, as every group layer is — and
 * here that thinness is the security property, not just the house style: the
 * handler has no access to a plaintext secret because the repository's outward
 * surface has no method that returns one, so there is nothing on this side of
 * the boundary to leak (ADR 0011).
 */
export const SecretsLive = HttpApiBuilder.group(Api, "secrets", (handlers) =>
	Effect.gen(function* () {
		const repo = yield* SecretsRepo;
		return handlers
			.handle("status", (_) => repo.status(_.path.name))
			.handle("put", (_) => repo.put(_.path.name, _.payload.value))
			.handle("clear", (_) => repo.clear(_.path.name));
	}),
).pipe(Layer.provide(SecretsRepo.Default));
