import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { RuleRepo } from "./repository";

/**
 * Implements the `rules` group of the contract on {@link RuleRepo}: `list`/`count`
 * (both `merchantId?`-filtered), `getById`, `getByMerchantPattern`, `create`,
 * `update`, `remove`. Each handler is a thin delegate; status codes / success
 * bodies are set by the contract, not here.
 */
export const RulesLive = HttpApiBuilder.group(Api, "rules", (handlers) =>
	Effect.gen(function* () {
		const repo = yield* RuleRepo;
		return handlers
			.handle("list", (_) => repo.list(_.urlParams))
			.handle("count", (_) => repo.count(_.urlParams.merchantId))
			.handle("getById", (_) => repo.getById(_.path.id))
			.handle("getByMerchantPattern", (_) =>
				repo.getByMerchantPattern(_.path.merchantId, _.path.pattern),
			)
			.handle("create", (_) => repo.create(_.payload))
			.handle("update", (_) => repo.update(_.path.id, _.payload))
			.handle("remove", (_) => repo.remove(_.path.id));
	}),
).pipe(Layer.provide(RuleRepo.Default));
