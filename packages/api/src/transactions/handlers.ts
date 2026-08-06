import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { IssuerMatcher } from "../matching/issuer-matcher";
import { TransactionRepo } from "./repository";

/**
 * Implements the whole `transactions` group on {@link TransactionRepo}: the core
 * (composable `list`/`count`, `getById`, `create`, `update`, `remove`) plus the
 * bulk + targeted-delete endpoints (`bulkCreate`/`bulkPut`/`bulkDelete`/`bulkGet`,
 * `deleteByImportBatch`). Each handler is a thin delegate; status codes / success
 * bodies are set by the contract, not here.
 *
 * `bundleImpact` (issue #77) is the pre-flight of deleting a statement's rows:
 * how many **bundles** hold a row of that account + month. It reads through the
 * same repository routine every delete dissolves through, so the warning and the
 * delete can never disagree about what is about to go.
 *
 * No handler here deletes a month. `bulkCreate` is the whole of an import commit
 * (issue #88): the rows are inserted and nothing is removed, which is why the
 * account-month delete this group used to carry is gone rather than unused.
 *
 * `recap`/`recapPeriods` (issue #71) are delegates like the rest: the spend
 * summary is summed in SQL over the whole filtered set, and the one
 * `countsTowardRecap` predicate lives in `recap-predicate.ts` beside the derived
 * expressions it is built from — never restated here.
 *
 * The bundle endpoints (`createBundle`/`addBundleMember`/`removeBundleMember`/
 * `dissolveBundle`) are delegates too, twice over: the repository forwards them
 * to `bundle-writes.ts` (issue #83), where the eligibility cascade the create and
 * add-member paths share is stated once.
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
				.handle("recap", (_) => repo.recap(_.urlParams))
				.handle("recapPeriods", () => repo.recapPeriods())
				.handle("getById", (_) => repo.getById(_.path.id))
				.handle("transferCandidates", () => repo.transferCandidates())
				.handle("dismissTransferPairs", (_) =>
					repo.dismissTransferPairs(_.payload.pairs),
				)
				.handle("transferSuggestions", (_) => repo.suggestTransfers(_.path.id))
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
				.handle("deleteByImportBatch", (_) =>
					repo.deleteByImportBatch(_.path.batchId),
				)
				.handle("bundleImpact", (_) =>
					repo.bundleImpact(_.urlParams.accountId, _.urlParams.importMonth),
				)
				.handle("linkTransfer", (_) => repo.linkTransfer(_.payload.ids))
				.handle("unlinkTransfer", (_) =>
					repo.unlinkTransfer(_.payload.transferGroupId),
				)
				.handle("createBundle", (_) =>
					repo.createBundle(_.payload.ids, _.payload.label),
				)
				.handle("addBundleMember", (_) =>
					repo.addBundleMember(_.payload.bundleId, _.payload.transactionId),
				)
				.handle("removeBundleMember", (_) =>
					repo.removeBundleMember(_.payload.transactionId),
				)
				.handle("dissolveBundle", (_) =>
					repo.dissolveBundle(_.payload.bundleId),
				);
		}),
).pipe(Layer.provide([TransactionRepo.Default, IssuerMatcher.Default]));
