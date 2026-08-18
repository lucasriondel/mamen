import {
  AI_TASKS,
  type AiProvider,
  type AiTask,
  AiTaskSetting,
  DEFAULT_AI_PROVIDER,
  defaultModelFor,
  isHostedProvider,
  isModelOfProvider,
  type TaskProviderRejected,
} from "@mamen/shared/contract";

/**
 * The **save-time kernel** (issue #119, PRD #115) — the one rule of the AI
 * settings feature, as a pure function of its inputs:
 *
 * > A task must never be left pointing at a provider that cannot run it.
 *
 * It has no database, no I/O and no Effect: given a patch, the current settings
 * and which providers have a credential, it answers with a rejection or `null`.
 * The layers above it — the two **checked write doors** in `task-provider.ts` —
 * read the state, ask this module, and write only on `null`.
 *
 * The split is what makes the rule testable: its whole decision matrix (every
 * combination of provider, model validity and credential presence, for both
 * doors) is a table of function calls in `kernel.test.ts`, not dozens of HTTP
 * round trips against a database.
 *
 * Credential presence arrives as a plain `Set` of providers, derived from the
 * secrets module's **status boolean**. Nothing here reads, holds or decrypts a
 * credential — which is what leaves the single-decryptor rule (ADR 0011)
 * untouched by save-time checking.
 */

/** What one task runs on. */
export interface AiTaskChoice {
  readonly provider: AiProvider;
  readonly model: string;
}

/** Every task's choice — total over the catalogue, so there is no absent case. */
export type AiTaskChoices = { readonly [T in AiTask]: AiTaskChoice };

/** One task's half-edit; either half may be omitted (see {@link applyChange}). */
export interface AiTaskChange {
  readonly task: AiTask;
  readonly provider?: AiProvider | undefined;
  readonly model?: string | undefined;
}

/**
 * Why a write is refused — plain data, in the shape {@link TaskProviderRejected}
 * carries. The kernel returns **data, not the wire error**: constructing the
 * contract's `Schema.TaggedError` runs a decode, which is an edge concern, and a
 * pure decision function that can throw on its own output is not one. The doors
 * build the error from this, one line above.
 */
export interface AiTaskRejection {
  readonly task: AiTask;
  readonly provider: AiProvider;
  readonly reason: TaskProviderRejected["reason"];
}

/**
 * What a task runs on before anyone has chosen: the local CLI on its cheap
 * model. Held here rather than written into a row by a migration, so the default
 * stays a fact of the catalogue — a fresh install and an untouched task read the
 * same one, and moving it is one edit.
 */
export const DEFAULT_AI_CHOICE: AiTaskChoice = {
  provider: DEFAULT_AI_PROVIDER,
  model: defaultModelFor(DEFAULT_AI_PROVIDER),
};

/**
 * The choice a change lands on, given what is stored.
 *
 * **A named provider with no model lands on that provider's default** — the
 * cheap head of its list — rather than keeping the stored model, because a model
 * id means nothing at a different vendor and a name that happens to exist at
 * both would silently change what the user pays. Naming the provider a task is
 * already on is not a switch, so it keeps the stored model: re-saving must not
 * reset a deliberately chosen expensive model.
 *
 * **A model with no provider resolves against the stored row.** That is the
 * front-door way into the same impossible pairing, which is why a model-only
 * edit is checked exactly as a two-field save is.
 */
export const applyChange = (change: AiTaskChange, current: AiTaskChoice): AiTaskChoice => {
  const provider = change.provider ?? current.provider;
  const model =
    change.model ?? (provider === current.provider ? current.model : defaultModelFor(provider));
  return { provider, model };
};

/**
 * Why this choice cannot run, or `null`. **Order is the decision**: the model is
 * checked before the credential, because a model the vendor does not serve is
 * wrong whether or not a key exists — telling the user to go and store a key
 * would send them to fix the wrong thing.
 *
 * `claude-code` never fails the credential half. Its token is a run-time
 * concern; checking it here would refuse every save on a fresh install,
 * including the save that switches away from it.
 */
const reasonFor = (
  choice: AiTaskChoice,
  configured: ReadonlySet<AiProvider>,
): "model-not-served" | "no-credential" | null => {
  if (!isModelOfProvider(choice.provider, choice.model)) {
    return "model-not-served";
  }
  if (isHostedProvider(choice.provider) && !configured.has(choice.provider)) {
    return "no-credential";
  }
  return null;
};

/** Can this task run, as it currently stands? */
const runnable = (choice: AiTaskChoice, configured: ReadonlySet<AiProvider>): boolean =>
  reasonFor(choice, configured) === null;

/**
 * The **resolver's** decision: what does this task run on, or why can it not?
 * `null` means the stored choice runs.
 *
 * It is the same two checks in the same order the doors run, deliberately: the
 * resolver and the doors are one question asked at two moments, and a stored
 * choice a door accepted must not be one the runner then refuses. What the two
 * *do* differ on is coverage — a door checks the tasks a write touches, the
 * resolver checks the one task about to spend a request.
 */
export const rejectTask = (
  task: AiTask,
  current: AiTaskChoices,
  configured: ReadonlySet<AiProvider>,
): AiTaskRejection | null => {
  const choice = current[task];
  const reason = reasonFor(choice, configured);
  return reason === null ? null : { task, provider: choice.provider, reason };
};

/**
 * Every task's stored choice as the wire shape, **in catalogue order** and one
 * entry per task whether or not anything was ever saved — the picker's question
 * is "what runs each task", and "the default, because nobody has chosen" is an
 * answer to it.
 */
export const toSettings = (current: AiTaskChoices): ReadonlyArray<AiTaskSetting> =>
  AI_TASKS.map(
    (task) =>
      new AiTaskSetting({
        task,
        provider: current[task].provider,
        model: current[task].model,
      }),
  );

/**
 * The **patch door's** decision. `null` means every entry lands somewhere
 * runnable and the write may proceed; a rejection means **none of it** is
 * written — one bad half refuses the whole patch, so a refused edit never leaves
 * half of itself applied.
 *
 * Only the tasks the patch names are checked. A stored value that went bad out
 * of band — a model dropped from the catalogue, a key cleared before this rule
 * existed — must not make every unrelated save fail; touching that task is when
 * it is caught.
 */
export const rejectPatch = (
  changes: ReadonlyArray<AiTaskChange>,
  current: AiTaskChoices,
  configured: ReadonlySet<AiProvider>,
): AiTaskRejection | null => {
  for (const change of changes) {
    const choice = applyChange(change, current[change.task]);
    const reason = reasonFor(choice, configured);
    if (reason !== null) {
      return { task: change.task, provider: choice.provider, reason };
    }
  }
  return null;
};

/**
 * The **deletion door's** decision: may this provider's credential be cleared?
 *
 * Refused exactly when the deletion is what breaks a task — the task runs today
 * and would not run afterwards. Two consequences follow from stating it that
 * way rather than as "some task names this provider":
 *
 * - a task that is *already* unrunnable (a model that left the catalogue) does
 *   not hold an unrelated key hostage;
 * - clearing the `claude-code` credential is always allowed, because a task on
 *   `claude-code` runs at save time with or without one. The two doors have to
 *   agree — a state a save would accept is not a state a deletion may refuse to
 *   produce — or the rule is not a rule.
 */
export const rejectClear = (
  provider: AiProvider,
  current: AiTaskChoices,
  configured: ReadonlySet<AiProvider>,
): AiTaskRejection | null => {
  const after = new Set([...configured].filter((candidate) => candidate !== provider));
  // Over the settings themselves rather than over `AI_TASKS`: the two sets are
  // the same (the store answers for every task in the catalogue), and reading
  // the argument keeps this a function of its inputs alone.
  for (const [task, choice] of Object.entries(current) as ReadonlyArray<[AiTask, AiTaskChoice]>) {
    if (runnable(choice, configured) && !runnable(choice, after)) {
      return { task, provider, reason: "credential-in-use" };
    }
  }
  return null;
};
