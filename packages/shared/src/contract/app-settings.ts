import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";

/**
 * App-settings entity (contract §2.9) — a fixed-shape singleton. `id` is the
 * literal `"app"` (there is only one row; not branded, not a path param).
 *
 * It carried one field, the `LlmSettings` block, until issue #116 deleted it: a
 * faithful port of a feature that no longer exists, which no client read, and
 * whose `apiKey` was a plain string `GET /app-settings` handed back to anyone
 * who asked. The singleton itself stays — the row, the endpoints and the dump
 * slot are the shape the next typed app-wide setting lands in — but it now
 * carries nothing beyond its own identity.
 */
export class AppSettings extends Schema.Class<AppSettings>("AppSettings")({
  id: Schema.Literal("app"),
}) {}

/**
 * App-settings group (contract §2.9), prefix `/app-settings`. A single
 * fixed-shape row. `get` 404s when the singleton doesn't exist yet (faithful);
 * `put` is a whole-object upsert (single row, id `"app"`) that always succeeds →
 * no error. Dropped vs today: `POST /app-settings/clear` (client-only).
 */
export class AppSettingsGroup extends HttpApiGroup.make("appSettings")
  .add(HttpApiEndpoint.get("get")`/app-settings`.addSuccess(AppSettings).addError(NotFound))
  .add(HttpApiEndpoint.put("put")`/app-settings`.setPayload(AppSettings).addSuccess(AppSettings))
  .annotateContext(OpenApi.annotations({ title: "App-settings" })) {}
