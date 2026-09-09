import { Schema } from "effect";

/**
 * The **AI catalogue** (issue #118, PRD #115) — the vocabulary of providers,
 * models and tasks that both halves of mamen read: the web picker renders it,
 * the API's save-time validator refuses against it, and the task table is keyed
 * by it.
 *
 * It is a deliberate **leaf**. Nothing here imports another contract module, a
 * repository or a database, so a build config, a React component and an Effect
 * handler can all reach the same list without dragging anything behind it. Its
 * only dependency is `effect`, for the two schema literals; `ai.test.ts` holds
 * that.
 *
 * It is **curated, not free text**. A provider/model pairing is validated when
 * the user saves it, so a model id the selected vendor does not serve has to be
 * refusable — which means a closed list is what makes the refusal possible at
 * all.
 */

/**
 * Every AI provider mamen supports: the local `claude-code` CLI plus the three
 * hosted vendors.
 *
 * A `Schema.Literal`, so an unknown id fails decode at the edge — a 400 rather
 * than a handler inventing an answer for a provider nobody defined.
 *
 * **A provider is named directly, never parsed out of a model id.** The
 * credential lookup is keyed by provider, so code fetching a key has to be able
 * to say whose key it wants; the same id is the name a stored credential lives
 * under and the value a task's provider column holds.
 */
export const AiProvider = Schema.Literal("claude-code", "anthropic", "google", "openai");
export type AiProvider = typeof AiProvider.Type;

/**
 * The providers in display order, `claude-code` first — the order a picker
 * renders and the order a status list answers in. Held against
 * {@link AiProvider}'s members by a test, so the list cannot fall behind the
 * literal it mirrors.
 */
export const AI_PROVIDERS = [
  "claude-code",
  "anthropic",
  "google",
  "openai",
] as const satisfies ReadonlyArray<AiProvider>;

/**
 * The provider a fresh install runs a task on, and stays on until the user
 * chooses otherwise. `claude-code` runs on the machine mamen is installed on,
 * so a statement never leaves it — a fresh install must never post a bank
 * statement to a vendor the user did not pick.
 */
export const DEFAULT_AI_PROVIDER: AiProvider = "claude-code";

/**
 * What a provider is called on screen. Separate from the id because the id is
 * the wire value and a rename of the label must not be a migration.
 */
export const AI_PROVIDER_LABELS: { readonly [P in AiProvider]: string } = {
  "claude-code": "Claude Code",
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
};

/**
 * The curated model list per provider. **The first entry is that provider's
 * default, and it is the cheap, fast one** — switching vendor lands the user on
 * the least expensive model that vendor serves, never the priciest, so a change
 * of provider cannot silently raise a bill. Held by a test that names the
 * expected head per provider, because "cheap" is a fact about a vendor's price
 * list that this module does not carry.
 *
 * **Model ids are bare** — `claude-haiku-4-5`, never `anthropic/claude-haiku-4-5`.
 * The provider is already known (it is the key), so a prefix would be a second
 * place the same fact is written and a second thing to keep in step.
 *
 * `claude-code` runs Anthropic's models through the local CLI, so it lists the
 * same ids; they are two ways to reach a model, and which one runs a task is
 * exactly the choice the user is making.
 *
 * Short on purpose: this is the set worth offering, not the set that exists. A
 * vendor's full catalogue is a menu nobody can choose from.
 */
export const AI_PROVIDER_MODELS: {
  readonly [P in AiProvider]: readonly [string, ...string[]];
} = {
  "claude-code": ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
  anthropic: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
  google: ["gemini-2.5-flash", "gemini-2.5-pro"],
  openai: ["gpt-5-mini", "gpt-5"],
};

/**
 * The AI tasks a provider and model can be chosen for. One member: extracting
 * transactions from an uploaded PDF bank statement. The shape is built to take
 * more, but categorisation, issuer-matching and every other AI feature is a
 * separate spec.
 */
export const AiTask = Schema.Literal("extract-pdf");
export type AiTask = typeof AiTask.Type;

/** The tasks in display order. Mirrors {@link AiTask}, held by a test. */
export const AI_TASKS = ["extract-pdf"] as const satisfies ReadonlyArray<AiTask>;

/**
 * Is this provider a **hosted vendor** — one that runs on someone else's
 * machine, and therefore one a bank statement would be *sent to*?
 *
 * Defined as "not the local CLI" rather than by listing the vendors: a provider
 * added later is hosted until someone deliberately says otherwise, which is the
 * safe default for a predicate whose false answer means "nothing leaves this
 * machine".
 */
export const isHostedProvider = (provider: AiProvider): boolean => provider !== "claude-code";

/** This provider's default model — the cheap one at the head of its list. */
export const defaultModelFor = (provider: AiProvider): string => AI_PROVIDER_MODELS[provider][0];

/**
 * Does this provider serve this model? The save-time check behind "a task can
 * never be left pointing at a model its vendor does not serve", and the reason
 * the model list is curated rather than free text.
 *
 * Exact match on a bare id, so a vendor-prefixed spelling
 * (`anthropic/claude-haiku-4-5`) is a model nobody serves rather than a second
 * name for one somebody does.
 */
export const isModelOfProvider = (provider: AiProvider, model: string): boolean =>
  AI_PROVIDER_MODELS[provider].includes(model);
