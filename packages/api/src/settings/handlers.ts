import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { SettingRepo } from "./repository";

/**
 * Implements the `settings` group of the contract on {@link SettingRepo}:
 * `list` (paged), `getByKey` (404 on an absent valid key), `putByKey` (upsert on
 * `key`, returns the stored `Setting`). Each handler is a thin delegate; status
 * codes / success bodies are set by the contract, not here.
 */
export const SettingsLive = HttpApiBuilder.group(Api, "settings", (handlers) =>
  Effect.gen(function* () {
    const repo = yield* SettingRepo;
    return handlers
      .handle("list", (_) => repo.list(_.urlParams))
      .handle("getByKey", (_) => repo.getByKey(_.path.key))
      .handle("putByKey", (_) => repo.putByKey(_.payload));
  }),
).pipe(Layer.provide(SettingRepo.Default));
