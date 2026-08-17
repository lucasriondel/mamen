import type {
	AiProvider,
	AiTask,
	AiTaskSetting,
	SecretStatus,
} from "@mamen/shared/contract";
import { ResolvedAiTask, TaskProviderRejected } from "@mamen/shared/contract";
import { Effect } from "effect";
import { SecretsRepo } from "../secrets/repository";
import {
	type AiTaskChange,
	type AiTaskRejection,
	applyChange,
	rejectClear,
	rejectPatch,
	rejectTask,
	toSettings,
} from "./kernel";
import { AiTaskRepo } from "./repository";

/**
 * The **task-provider** service (issue #119, PRD #115) — the layer that composes
 * the settings store and the secrets repository and enforces the one rule of
 * this feature: *a task must never be left pointing at a provider that cannot
 * run it*.
 *
 * It is deliberately thin, because the deciding is `kernel.ts`'s. What lives
 * here is the three things a pure function cannot do:
 *
 * - **the two checked write doors** — read the current state, ask the kernel,
 *   write only on `null`. There are two because there are two ways into an
 *   unrunnable state: {@link patch}, which moves a task onto a provider, and
 *   {@link clearCredential}, which takes a provider out from under a task. A
 *   feature with one door and one honour-system caller is a feature with no
 *   door.
 * - **the resolver** — {@link resolve}, what the runner asks before spending a
 *   request.
 * - **reading credential presence**, which it does through `statusAll`'s
 *   **boolean** and nothing else. It never holds, reads or decrypts a
 *   credential, which is what leaves the single-decryptor rule (ADR 0011)
 *   exactly where issue #117 left it — this module imports the *outward*
 *   repository, whose every method answers with a status.
 *
 * Nothing imports it back: `AiTaskRepo` and `SecretsRepo` are both unaware of
 * it, so there is no cycle. The secrets *handler* reaches it for the deletion
 * door, which is a layer above both.
 */

/** A credential that will not decrypt still counts as present — see below. */
const presentIn = (statuses: ReadonlyArray<SecretStatus>): Set<AiProvider> =>
	new Set(statuses.filter((_) => _.configured).map((_) => _.name));

export class TaskProvider extends Effect.Service<TaskProvider>()(
	"api/TaskProvider",
	{
		effect: Effect.gen(function* () {
			const tasks = yield* AiTaskRepo;
			const secrets = yield* SecretsRepo;

			/**
			 * Which providers have a credential, as the kernel wants it.
			 *
			 * Read through the **status boolean**, so a stored value that will not
			 * decrypt counts as present: a rotated `TOKEN_ENCRYPTION_KEY` is an
			 * operator fault to be fixed by re-pasting, and refusing every save
			 * until then would take the settings page away at exactly the moment it
			 * is needed. Whether the credential actually *works* is a question only
			 * a run can answer, at both vendors and here.
			 */
			const configured: Effect.Effect<Set<AiProvider>> = secrets
				.statusAll()
				.pipe(Effect.map(presentIn));

			const state = Effect.all({
				current: tasks.readChoices(),
				configured,
			});

			const refuse = (rejection: AiTaskRejection) =>
				Effect.fail(new TaskProviderRejected(rejection));

			/** Every task's stored choice, in catalogue order. */
			const settings = (): Effect.Effect<ReadonlyArray<AiTaskSetting>> =>
				tasks.readChoices().pipe(Effect.map(toSettings));

			/**
			 * The **patch door**. One bad half anywhere refuses the whole patch, and
			 * a refusal writes nothing at all — the check runs before the write, not
			 * per entry during it, so there is no half-applied state to roll back.
			 *
			 * The answer is re-read rather than assembled from what was sent, so the
			 * caller is told what is stored rather than what was asked for.
			 */
			const patch = (
				changes: ReadonlyArray<AiTaskChange>,
			): Effect.Effect<ReadonlyArray<AiTaskSetting>, TaskProviderRejected> =>
				Effect.gen(function* () {
					const { current, configured } = yield* state;

					const rejection = rejectPatch(changes, current, configured);
					if (rejection !== null) {
						return yield* refuse(rejection);
					}

					yield* tasks.writeAll(
						changes.map(
							(change) =>
								[
									change.task,
									applyChange(change, current[change.task]),
								] as const,
						),
					);
					return yield* settings();
				});

			/**
			 * The **deletion door**: clear a credential, unless doing so would turn a
			 * task that runs today into one that cannot. The kernel decides that by
			 * asking its own runnability question twice, so this door and the patch
			 * door cannot drift into disagreeing.
			 */
			const clearCredential = (
				provider: AiProvider,
			): Effect.Effect<SecretStatus, TaskProviderRejected> =>
				Effect.gen(function* () {
					const { current, configured } = yield* state;

					const rejection = rejectClear(provider, current, configured);
					if (rejection !== null) {
						return yield* refuse(rejection);
					}
					return yield* secrets.clear(provider);
				});

			/**
			 * The **resolver** — which provider and model this task runs on, or why
			 * it cannot. What the runner asks before spending a request.
			 *
			 * {@link ResolvedAiTask} carries no credential field, and must never grow
			 * one: this answers *whether and where*, and the key travels only inside
			 * the transport that spends it.
			 */
			const resolve = (
				task: AiTask,
			): Effect.Effect<ResolvedAiTask, TaskProviderRejected> =>
				Effect.gen(function* () {
					const { current, configured } = yield* state;

					const rejection = rejectTask(task, current, configured);
					if (rejection !== null) {
						return yield* refuse(rejection);
					}
					return new ResolvedAiTask({ task, ...current[task] });
				});

			return { settings, patch, clearCredential, resolve } as const;
		}),
		dependencies: [AiTaskRepo.Default, SecretsRepo.Default],
	},
) {}
