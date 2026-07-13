import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { IssuerMatcher } from "../matching/issuer-matcher";
import { TransactionRepo } from "./repository";

/**
 * Implements the whole `transactions` group on {@link TransactionRepo}: the core
 * (composable `list`/`count`, `getById`, `create`, `update`, `remove`) plus the
 * bulk + targeted-delete endpoints (`bulkCreate`/`bulkPut`/`bulkDelete`/`bulkGet`,
 * `deleteByAccountMonth`/`deleteByImportBatch`). Each handler is a thin delegate;
 * status codes / success bodies are set by the contract, not here.
 *
 * `bulkCreate` is the exception: after inserting the rows it runs the
 * {@link IssuerMatcher} over them so a freshly-imported statement arrives with
 * `issuerId` already resolved against the current Matching Rules (PRD #8; import
 * matching happens server-side per ADR 0001, the client still posts clean rows).
 */
export const TransactionsLive = HttpApiBuilder.group(
	Api,
	"transactions",
	(handlers) =>
		Effect.gen(function* () {
			const repo = yield* TransactionRepo;
			const matcher = yield* IssuerMatcher;
			return handlers
				.handle("list", (_) => repo.list(_.urlParams))
				.handle("count", (_) => repo.count(_.urlParams))
				.handle("getById", (_) => repo.getById(_.path.id))
				.handle("create", (_) => repo.create(_.payload))
				.handle("bulkCreate", (_) =>
					repo
						.bulkCreate(_.payload.records)
						.pipe(Effect.flatMap((rows) => matcher.matchImported(rows))),
				)
				.handle("update", (_) => repo.update(_.path.id, _.payload))
				.handle("bulkPut", (_) => repo.bulkPut(_.payload.records))
				.handle("remove", (_) => repo.remove(_.path.id))
				.handle("removeManualIssuer", (_) =>
					matcher.removeManualIssuer(_.path.id),
				)
				.handle("bulkDelete", (_) => repo.bulkDelete(_.payload.ids))
				.handle("bulkGet", (_) => repo.bulkGet(_.payload.ids))
				.handle("deleteByAccountMonth", (_) =>
					repo.deleteByAccountMonth(
						_.urlParams.accountId,
						_.urlParams.importMonth,
					),
				)
				.handle("deleteByImportBatch", (_) =>
					repo.deleteByImportBatch(_.path.batchId),
				);
		}),
).pipe(Layer.provide([TransactionRepo.Default, IssuerMatcher.Default]));
