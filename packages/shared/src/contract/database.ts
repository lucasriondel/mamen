import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "@effect/platform";
import { Schema } from "effect";
import { Account } from "./accounts";
import { AppSettings } from "./app-settings";
import { Category } from "./categories";
import { Merchant } from "./merchants";
import { Rule } from "./rules";
import { Setting } from "./settings";
import { Subscription } from "./subscriptions";
import { Transaction } from "./transactions";

/**
 * A whole-DB dump — one array per table, matching today's export/import shape.
 * Because it references every entity schema, this group is ported **last** (it
 * transitively depends on all the resource ports). `appSettings` is a 0- or
 * 1-element array (the singleton), kept as an array so the dump shape is
 * uniformly "array per table".
 */
export const DbDump = Schema.Struct({
	accounts: Schema.Array(Account),
	transactions: Schema.Array(Transaction),
	merchants: Schema.Array(Merchant),
	rules: Schema.Array(Rule),
	categories: Schema.Array(Category),
	subscriptions: Schema.Array(Subscription),
	settings: Schema.Array(Setting),
	appSettings: Schema.Array(AppSettings),
});
export type DbDump = typeof DbDump.Type;

/**
 * The `import` payload — every table optional (`Schema.partial(DbDump)`). A
 * table absent from the payload is still **wiped** (import is a destructive
 * clear-then-load, not a merge — faithful to today).
 */
export const DbImport = Schema.partial(DbDump);
export type DbImport = typeof DbImport.Type;

/**
 * The action-ack body for `reset` / `import`. This is the one place `{ ok: true }`
 * survives the envelope normalization (taxonomy §5 "action result"): a
 * destructive whole-DB op has no resource to return.
 */
export class DbOk extends Schema.Class<DbOk>("DbOk")({
	ok: Schema.Literal(true),
}) {}

/**
 * Database group (contract §2.10), prefix `/database`. Destructive whole-DB
 * admin ops — no auth, confirmation, or merge (local single-user; faithful).
 *
 * - `reset` — full wipe of all 8 tables (no reseed). Subsumes every dropped
 *   per-resource `clear` endpoint.
 * - `export` — read-all → `DbDump`. **Stays `POST`** (contract decision #6): a
 *   whole-DB dump is not a cacheable/idempotent GET, and the client persists the
 *   JSON body itself. A conscious REST exception.
 * - `import` — destructive clear-then-load in dependency order (accounts →
 *   categories → merchants → rules → transactions → subscriptions → settings;
 *   `appSettings = appSettings[0]`). Ids are preserved so the round-trip is exact.
 */
export class DatabaseGroup extends HttpApiGroup.make("database")
	.add(HttpApiEndpoint.post("reset")`/database/reset`.addSuccess(DbOk))
	.add(HttpApiEndpoint.post("export")`/database/export`.addSuccess(DbDump))
	.add(
		HttpApiEndpoint.post("import")`/database/import`
			.setPayload(DbImport)
			.addSuccess(DbOk),
	)
	.annotateContext(OpenApi.annotations({ title: "Database" })) {}
