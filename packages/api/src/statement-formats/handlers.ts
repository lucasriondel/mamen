import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { StatementFormatRepo } from "./repository";

/**
 * Implements the `statementFormats` group of the contract on
 * {@link StatementFormatRepo}. A thin group: a **Statement Format** is stored
 * data with no derivation and no cascade — nothing is recomputed when one is
 * written or deleted, because a format is a parse-time recipe that the browser
 * applies (web ADR 0001) and the rows it produced keep no reference to it.
 */
export const StatementFormatsLive = HttpApiBuilder.group(Api, "statementFormats", (handlers) =>
  Effect.gen(function* () {
    const repo = yield* StatementFormatRepo;
    return handlers
      .handle("list", (_) => repo.list(_.urlParams))
      .handle("getById", (_) => repo.getById(_.path.id))
      .handle("create", (_) => repo.create(_.payload))
      .handle("update", (_) => repo.update(_.path.id, _.payload))
      .handle("remove", (_) => repo.remove(_.path.id));
  }),
).pipe(Layer.provide(StatementFormatRepo.Default));
