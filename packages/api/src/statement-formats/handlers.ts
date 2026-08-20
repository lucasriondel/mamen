import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { StatementFormatRepo } from "./repository";

/**
 * Implements the `statementFormats` group of the contract on
 * {@link StatementFormatRepo}. A thin group: a **Statement Format** is stored
 * data with no derivation and no cascade — nothing is recomputed when one is
 * written, because nothing yet reads one, and even once the wizard does, a
 * format is applied in the browser rather than on the way in (web ADR 0001).
 */
export const StatementFormatsLive = HttpApiBuilder.group(Api, "statementFormats", (handlers) =>
  Effect.gen(function* () {
    const repo = yield* StatementFormatRepo;
    return handlers
      .handle("list", (_) => repo.list(_.urlParams))
      .handle("getById", (_) => repo.getById(_.path.id))
      .handle("create", (_) => repo.create(_.payload));
  }),
).pipe(Layer.provide(StatementFormatRepo.Default));
