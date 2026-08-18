import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { AppSettingsRepo } from "./repository";

/**
 * Implements the `appSettings` group of the contract on {@link AppSettingsRepo}:
 * `get` (404 when the singleton doesn't exist yet), `put` (whole-object upsert,
 * returns the stored `AppSettings`). Each handler is a thin delegate; status
 * codes / success bodies are set by the contract, not here.
 */
export const AppSettingsLive = HttpApiBuilder.group(Api, "appSettings", (handlers) =>
  Effect.gen(function* () {
    const repo = yield* AppSettingsRepo;
    return handlers.handle("get", () => repo.get()).handle("put", (_) => repo.put(_.payload));
  }),
).pipe(Layer.provide(AppSettingsRepo.Default));
