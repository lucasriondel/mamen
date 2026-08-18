import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { TaskProvider } from "./task-provider";

/**
 * Implements the `aiTasks` group of the contract on {@link TaskProvider}:
 * `list`, `patch` (the checked write door) and `resolve`. Three thin delegates,
 * as every group layer is — the rule they enforce is a layer down, which is what
 * lets the second door live on `DELETE /secrets/:name` and enforce the identical
 * rule without a second copy of it.
 */
export const AiTasksLive = HttpApiBuilder.group(Api, "aiTasks", (handlers) =>
  Effect.gen(function* () {
    const provider = yield* TaskProvider;
    return handlers
      .handle("list", () => provider.settings())
      .handle("patch", (_) => provider.patch(_.payload.tasks))
      .handle("resolve", (_) => provider.resolve(_.path.task));
  }),
).pipe(Layer.provide(TaskProvider.Default));
