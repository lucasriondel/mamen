import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { DatabaseRepo } from "./repository";

/**
 * Implements the `database` group of the contract on {@link DatabaseRepo}:
 * `reset` (wipe all 8 tables), `export` (read-all → `DbDump`, stays POST),
 * `import` (destructive clear-then-load in dependency order). Each handler is a
 * thin delegate; the success bodies (`DbOk` / `DbDump`) are set by the contract.
 */
export const DatabaseLive = HttpApiBuilder.group(Api, "database", (handlers) =>
  Effect.gen(function* () {
    const repo = yield* DatabaseRepo;
    return handlers
      .handle("reset", () => repo.reset())
      .handle("export", () => repo.exportAll())
      .handle("import", (_) => repo.import(_.payload));
  }),
).pipe(Layer.provide(DatabaseRepo.Default));
