import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { TransactionRepo } from "./repository";

/**
 * Implements the **core** of the `transactions` group on {@link TransactionRepo}:
 * composable `list`/`count`, `getById`, `create`, `update`, `remove`. The bulk +
 * targeted-delete endpoints are handled by the follow-up bulk port, which adds
 * its handlers to this same group.
 */
export const TransactionsLive = HttpApiBuilder.group(
	Api,
	"transactions",
	(handlers) =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			return handlers
				.handle("list", (_) => repo.list(_.urlParams))
				.handle("count", (_) => repo.count(_.urlParams))
				.handle("getById", (_) => repo.getById(_.path.id))
				.handle("create", (_) => repo.create(_.payload))
				.handle("update", (_) => repo.update(_.path.id, _.payload))
				.handle("remove", (_) => repo.remove(_.path.id));
		}),
).pipe(Layer.provide(TransactionRepo.Default));
