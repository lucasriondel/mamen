import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Layer } from "effect";
import { AccountsLive } from "./accounts/handlers";
import { AppSettingsLive } from "./app-settings/handlers";
import { CategoriesLive } from "./categories/handlers";
import { DatabaseLive } from "./database/handlers";
import { HealthLive } from "./health/handlers";
import { IssuersLive } from "./issuers/handlers";
import { RulesLive } from "./rules/handlers";
import { SettingsLive } from "./settings/handlers";
import { SubscriptionsLive } from "./subscriptions/handlers";
import { TransactionsLive } from "./transactions/handlers";

/**
 * The assembled API layer: the contract wired to every group implementation.
 * New group layers are added to the provide list as resources are ported.
 *
 * This layer still **requires** `SqlClient.SqlClient` — the caller provides the
 * data layer: `DatabaseLive` (Bun, real file) in prod via `ServerLive`, or
 * `DatabaseTest` (`:memory:`, sqlite-node) in tests. Keeping the DB out of here
 * is what lets the integration tests swap the driver. The issuer image
 * handlers additionally require `FileSystem` / `Path`, satisfied by the platform
 * in the server layer (Bun / Node).
 *
 * The `/uploads/*` static route ({@link StaticUploadsLive}) is NOT part of this
 * layer: it mutates the served `HttpApiBuilder.Router` directly (like
 * `middlewareOpenApi`), so it's provided to `HttpApiBuilder.serve(...)` at the
 * server composition, not pulled through the `HttpApi.Api` build here.
 */
export const ApiLive = HttpApiBuilder.api(Api).pipe(
	Layer.provide([
		HealthLive,
		AccountsLive,
		CategoriesLive,
		IssuersLive,
		TransactionsLive,
		RulesLive,
		SubscriptionsLive,
		SettingsLive,
		AppSettingsLive,
		DatabaseLive,
	]),
);
