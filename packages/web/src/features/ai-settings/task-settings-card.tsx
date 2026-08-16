import type {
	AiProvider,
	AiTask,
	AiTaskChange,
	AiTaskSetting,
	SecretStatus,
} from "@mamen/shared/contract";
import {
	AI_PROVIDER_LABELS,
	AI_PROVIDER_MODELS,
	AI_PROVIDERS,
	AI_TASKS,
	DEFAULT_AI_PROVIDER,
	defaultModelFor,
	isHostedProvider,
} from "@mamen/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ModelRow } from "@/components/ui/model-row";
import { SettingsCard } from "@/components/ui/setting-row";
import { aiTaskKeys, aiTaskMutations } from "@/lib/sdk";
import { toErrorMessage } from "@/lib/sdk-error";
import { AI_TASK_COPY, hostedVendorNotice } from "./copy";

/**
 * The task half of the AI settings page — one row per AI task, each naming
 * which provider runs it and which of that provider's models.
 *
 * **The picker offers only providers that can run the task**, which is the same
 * rule the save-time doors enforce (`api/src/ai-tasks/kernel.ts`), surfaced so
 * the user does not have to discover it by being refused. Restating it here is
 * the one duplication this page carries, and it is deliberate: the doors stay
 * the authority — a save the picker somehow allowed is still refused, and the
 * refusal is shown — while the picker's job is to not offer the impossible in
 * the first place. The doors' *other* half, the model check, needs no restating:
 * the model list is `AI_PROVIDER_MODELS` for the selected provider, so a model
 * the vendor does not serve is not offerable.
 *
 * **Saving is immediate** — no submit button, per the PRD — so the picker always
 * reflects what will actually run. Nothing is held in local state: the selects
 * read the query's data, so a refused patch (which writes nothing) leaves them
 * showing what is stored rather than a choice the server does not hold.
 *
 * The saved tick is **not** on a timer. It reads the mutation's own state, so it
 * appears when a save lands and is replaced the next time one is made. A timer
 * would say "saved" and then say nothing, which is the same thing an untouched
 * row says — and the difference between "it took" and "you have not changed
 * anything yet" is the whole reason the indication exists.
 */
export function TaskSettingsCard({
	settings,
	statuses,
	disabled,
}: {
	settings: ReadonlyArray<AiTaskSetting>;
	statuses: ReadonlyArray<SecretStatus>;
	disabled: boolean;
}) {
	const queryClient = useQueryClient();

	const patch = useMutation({
		mutationFn: (change: AiTaskChange) => aiTaskMutations.patch([change]),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: aiTaskKeys.all }),
	});

	/**
	 * Which providers hold a credential. `claude-code` is never asked: its token
	 * is a run-time concern the doors deliberately do not check at save time, so
	 * treating it as unrunnable here would hide the default from a fresh install
	 * — including from the user trying to switch back to it.
	 */
	const configured = new Set(
		statuses.filter((entry) => entry.configured).map((entry) => entry.name),
	);
	const canRun = (provider: AiProvider) =>
		!isHostedProvider(provider) || configured.has(provider);

	const offered = AI_PROVIDERS.filter(canRun).map((provider) => ({
		id: provider,
		label: AI_PROVIDER_LABELS[provider],
	}));

	/**
	 * What a task runs on. An absent entry reads as the catalogue default, the
	 * same answer the API's store gives for a row nobody has written — the list
	 * is exhaustive, so this only stands in while the first read is in flight.
	 */
	const settingFor = (task: AiTask) =>
		settings.find((entry) => entry.task === task) ?? {
			task,
			provider: DEFAULT_AI_PROVIDER,
			model: defaultModelFor(DEFAULT_AI_PROVIDER),
		};

	return (
		<SettingsCard>
			{AI_TASKS.map((task) => {
				const setting = settingFor(task);
				const { title, description } = AI_TASK_COPY[task];
				const pending = patch.isPending && patch.variables?.task === task;
				const settled = patch.isSuccess && patch.variables?.task === task;
				const error =
					patch.error && patch.variables?.task === task
						? toErrorMessage(patch.error)
						: null;

				return (
					<ModelRow
						key={task}
						title={title}
						description={description}
						provider={setting.provider}
						providers={offered}
						model={setting.model}
						// Bare ids, as they are stored and as the vendor spells them: a
						// prettified name would be a second place the same fact lives, and
						// the id is what a user checks against the vendor's own pricing page.
						models={AI_PROVIDER_MODELS[setting.provider].map((model) => ({
							id: model,
							label: model,
						}))}
						// A provider change sends the provider alone and lets the server
						// land it on that vendor's cheap default, then follows the echo —
						// guessing here would fork the "which model now" decision.
						onProviderChange={(provider) =>
							patch.mutate({ task, provider: provider as AiProvider })
						}
						onModelChange={(model) => patch.mutate({ task, model })}
						disabled={disabled}
						saving={pending}
						saved={settled}
						error={error}
					>
						{isHostedProvider(setting.provider) ? (
							<p className="mt-2 text-xs text-gousse-ink">
								{hostedVendorNotice(setting.provider)}
							</p>
						) : null}
					</ModelRow>
				);
			})}
		</SettingsCard>
	);
}
