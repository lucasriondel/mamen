import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";

/**
 * The typed LLM configuration block held inside {@link AppSettings}. Distinct
 * from the loose `llm_*` keys in `/settings` — the duplication is accepted and
 * faithful (contract decision #2): no merge, the two stores stay independent.
 * `lastTestedAt` is the one date field (optional); everything else is a string
 * or a small literal union.
 */
export class LlmSettings extends Schema.Class<LlmSettings>("LlmSettings")({
	endpoint: Schema.String,
	apiKey: Schema.optional(Schema.String),
	modelName: Schema.String,
	provider: Schema.Literal("ollama", "lm-studio", "openai", "anthropic", "custom"),
	lastTestedAt: Schema.optional(Schema.Date),
	lastTestSuccess: Schema.optional(Schema.Boolean),
}) {}

/**
 * App-settings entity (contract §2.9) — a fixed-shape singleton. `id` is the
 * literal `"app"` (there is only one row; not branded, not a path param).
 */
export class AppSettings extends Schema.Class<AppSettings>("AppSettings")({
	id: Schema.Literal("app"),
	llm: LlmSettings,
}) {}

/**
 * App-settings group (contract §2.9), prefix `/app-settings`. A single
 * fixed-shape row. `get` 404s when the singleton doesn't exist yet (faithful);
 * `put` is a whole-object upsert (single row, id `"app"`) that always succeeds →
 * no error. Dropped vs today: `POST /app-settings/clear` (client-only).
 */
export class AppSettingsGroup extends HttpApiGroup.make("appSettings")
	.add(
		HttpApiEndpoint.get("get")`/app-settings`
			.addSuccess(AppSettings)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.put("put")`/app-settings`
			.setPayload(AppSettings)
			.addSuccess(AppSettings),
	)
	.annotateContext(OpenApi.annotations({ title: "App-settings" })) {}
