import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { SubscriptionRepo } from "./repository";

/**
 * Implements the `subscriptions` group of the contract on {@link SubscriptionRepo}:
 * `list` (composable `merchantId?` + `status?`), `create`, `update`,
 * `getFirstByMerchant`, `getByMerchantFrequency`. Each handler is a thin delegate;
 * status codes / success bodies are set by the contract, not here.
 */
export const SubscriptionsLive = HttpApiBuilder.group(
	Api,
	"subscriptions",
	(handlers) =>
		Effect.gen(function* () {
			const repo = yield* SubscriptionRepo;
			return handlers
				.handle("list", (_) => repo.list(_.urlParams))
				.handle("create", (_) => repo.create(_.payload))
				.handle("update", (_) => repo.update(_.path.id, _.payload))
				.handle("getFirstByMerchant", (_) =>
					repo.getFirstByMerchant(_.path.merchantId),
				)
				.handle("getByMerchantFrequency", (_) =>
					repo.getByMerchantFrequency(_.path.merchantId, _.path.frequency),
				);
		}),
).pipe(Layer.provide(SubscriptionRepo.Default));
