import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
import { SettingId } from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * The full set of allowed setting keys. Mirrors the TS `SettingKey` union —
 * **including `displayPreferences`**, which the old zod `settingKeySchema`
 * dropped (inventory §2 "Zod drift"). This contract fixes that drift. Used both
 * as the entity's `key` field and as the `getByKey` path param (a bad value
 * fails decode → 400 instead of the old unchecked cast).
 *
 * `llm_endpoint` / `llm_api_key` / `llm_model` were removed (issue #116): they
 * were the loose half of a dead LLM configuration surface no client read, and
 * one of them was a place to store an API key in the clear. A request naming one
 * is now an unknown key. Migration 0026 purges any stored rows, so a live table
 * never holds a key this union cannot decode.
 */
export const SettingKey = Schema.Literal(
  "currency_symbol",
  "date_format",
  "anomaly_threshold",
  "anomaly_settings",
  "displayPreferences",
);
export type SettingKey = typeof SettingKey.Type;

/**
 * Setting entity (contract §2.8) — a key/value row. `value` is **always a
 * string**; callers JSON-encode structured values themselves (faithful port —
 * the loose key/value store is kept as-is, distinct from the typed
 * `AppSettings`).
 */
export class Setting extends Schema.Class<Setting>("Setting")({
  id: SettingId,
  key: SettingKey,
  value: Schema.String,
}) {}

/**
 * Settings group (contract §2.8), prefix `/settings`. A key/value store keyed by
 * `key` (`UNIQUE` in the DB). The only writer is `putByKey`, an **upsert** on
 * `key` → it always succeeds, so it declares neither `NotFound` (no missing-row
 * case) nor `Conflict` (an upsert never hits the unique constraint). `getByKey`
 * 404s on a genuinely-absent-but-valid key; an unknown key fails the
 * `SettingKey` decode → 400. Dropped vs today: `DELETE /settings/:id`,
 * `POST /settings/clear` (both client-only).
 */
export class SettingsGroup extends HttpApiGroup.make("settings")
  .add(
    HttpApiEndpoint.get("list")`/settings`
      .setUrlParams(Schema.Struct(Pagination))
      .addSuccess(Paged(Setting)),
  )
  .add(
    HttpApiEndpoint.get("getByKey")`/settings/by-key/${HttpApiSchema.param("key", SettingKey)}`
      .addSuccess(Setting)
      .addError(NotFound),
  )
  .add(HttpApiEndpoint.put("putByKey")`/settings/by-key`.setPayload(Setting).addSuccess(Setting))
  .annotateContext(OpenApi.annotations({ title: "Settings" })) {}
