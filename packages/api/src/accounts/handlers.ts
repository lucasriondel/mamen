import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { AccountRepo } from "./repository";

/** Implements the `accounts` group of the contract on {@link AccountRepo}. */
export const AccountsLive = HttpApiBuilder.group(Api, "accounts", (handlers) =>
	Effect.gen(function* () {
		const repo = yield* AccountRepo;
		return handlers
			.handle("list", (_) => repo.list(_.urlParams.limit, _.urlParams.offset))
			.handle("getById", (_) => repo.getById(_.path.id))
			.handle("getByName", (_) => repo.getByName(_.path.name))
			.handle("create", (_) => repo.create(_.payload))
			.handle("update", (_) => repo.update(_.path.id, _.payload))
			.handle("remove", (_) => repo.remove(_.path.id));
	}),
).pipe(Layer.provide(AccountRepo.Default));
