import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { IssuerMatcher } from "../matching/issuer-matcher";
import { AccountRepo } from "./repository";

/**
 * Implements the `accounts` group of the contract on {@link AccountRepo}, with
 * one exception: `remove` goes through the {@link IssuerMatcher} (issue #90).
 * Deleting an account cascades into the Matching Rules whose **Account matcher**
 * names it, and the rows those rules had won must be re-derived in the same
 * transaction — which is the matcher's business, not the repository's.
 */
export const AccountsLive = HttpApiBuilder.group(Api, "accounts", (handlers) =>
  Effect.gen(function* () {
    const repo = yield* AccountRepo;
    const matcher = yield* IssuerMatcher;
    return handlers
      .handle("list", (_) => repo.list(_.urlParams.limit, _.urlParams.offset))
      .handle("getById", (_) => repo.getById(_.path.id))
      .handle("getByName", (_) => repo.getByName(_.path.name))
      .handle("create", (_) => repo.create(_.payload))
      .handle("update", (_) => repo.update(_.path.id, _.payload))
      .handle("remove", (_) => matcher.applyAccountDelete(_.path.id));
  }),
).pipe(Layer.provide([AccountRepo.Default, IssuerMatcher.Default]));
