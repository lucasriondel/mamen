import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { AiProvider, AiTask } from "./ai";
import { TaskProviderRejected } from "./errors";

/**
 * **Which provider and model runs each AI task** (issue #119, PRD #115) — the
 * choice the user makes on the settings page, and the one rule mamen enforces
 * around it: *a task must never be left pointing at a provider that cannot run
 * it*. Not a vendor with no stored credential, not a model that vendor does not
 * serve, and not a credential deleted out from under the task using it.
 *
 * The check runs at **save time**, where the user is still looking at the
 * picker, rather than at run time on their next import.
 */

/**
 * What a task runs on: a provider from the catalogue and one of that provider's
 * curated models. A stored choice — one per {@link AiTask} — and the shape
 * `GET /ai/tasks` answers with.
 *
 * The list is **exhaustive**: one entry per task in catalogue order, whether or
 * not the user has ever chosen anything, because a task nobody has touched still
 * runs on something (`claude-code` and its cheap default) and that is what the
 * picker has to render.
 */
export class AiTaskSetting extends Schema.Class<AiTaskSetting>("AiTaskSetting")({
  task: AiTask,
  provider: AiProvider,
  model: Schema.String,
}) {}

/** Every task's choice, in catalogue order. */
export const AiTaskSettings = Schema.Array(AiTaskSetting);

/**
 * One task's half-edit. **Either half may be omitted**, and what is omitted is
 * where the interesting behaviour lives:
 *
 * - `provider` alone — the task lands on that provider's **default model** (the
 *   cheap one at the head of its list), so a change of vendor never silently
 *   raises a bill by keeping a model name that happens to exist at both.
 * - `model` alone — resolved against the provider in the **stored row**. It is a
 *   way into the same impossible pairing through the front door, so it is
 *   checked exactly as a two-field save is.
 */
export class AiTaskChange extends Schema.Class<AiTaskChange>("AiTaskChange")({
  task: AiTask,
  provider: Schema.optional(AiProvider),
  model: Schema.optional(Schema.String),
}) {}

/**
 * A patch of any number of tasks, applied **whole or not at all**: one bad half
 * anywhere in it refuses the lot, so a refused edit never leaves half of itself
 * applied.
 *
 * Only the tasks named here are checked. A stored value that went bad out of
 * band — a model dropped from the catalogue, a key cleared before this rule
 * existed — must not make every unrelated save fail.
 */
export class AiTaskPatch extends Schema.Class<AiTaskPatch>("AiTaskPatch")({
  tasks: Schema.Array(AiTaskChange),
}) {}

/**
 * What the runner asks for before spending a request: *which provider and model
 * does this task run on, or why can it not*. The success side of that question;
 * the failure side is {@link TaskProviderRejected}.
 *
 * **It carries no credential field, and must never grow one.** Resolution
 * answers *whether and where*; a key travels only inside the transport that
 * spends it, and it is read through the secrets module's inward reader at that
 * point. Credential *presence* is all resolution needs, and it reads that
 * through the status boolean — which is what leaves the single-decryptor rule
 * (ADR 0011) untouched by this whole feature.
 */
export class ResolvedAiTask extends Schema.Class<ResolvedAiTask>("ResolvedAiTask")({
  task: AiTask,
  provider: AiProvider,
  model: Schema.String,
}) {}

/**
 * AI-tasks group, prefix `/ai/tasks` — read every task's choice, patch some of
 * them, and ask what a task actually resolves to.
 *
 * `patch` is the **checked write door**: it reads the current state, runs the
 * pure kernel, and writes only if nothing is rejected. The second door is not
 * here — it is `DELETE /secrets/:name`, which the same rule guards from the
 * other side, because deleting a credential is the other way into an unrunnable
 * task.
 */
export class AiTasksGroup extends HttpApiGroup.make("aiTasks")
  .add(HttpApiEndpoint.get("list")`/ai/tasks`.addSuccess(AiTaskSettings))
  .add(
    HttpApiEndpoint.patch("patch")`/ai/tasks`
      .setPayload(AiTaskPatch)
      .addSuccess(AiTaskSettings)
      .addError(TaskProviderRejected),
  )
  .add(
    HttpApiEndpoint.get("resolve")`/ai/tasks/${HttpApiSchema.param("task", AiTask)}/resolution`
      .addSuccess(ResolvedAiTask)
      .addError(TaskProviderRejected),
  )
  .annotateContext(OpenApi.annotations({ title: "AI tasks" })) {}
