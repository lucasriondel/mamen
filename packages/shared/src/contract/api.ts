import { HttpApi, HttpApiError, OpenApi } from "@effect/platform";
import { AccountsGroup } from "./accounts";
import { AppSettingsGroup } from "./app-settings";
import { CategoriesGroup } from "./categories";
import { DatabaseGroup } from "./database";
import { HealthGroup } from "./health";
import { ImportGroup } from "./import";
import { IssuersGroup } from "./issuers";
import { RulesGroup } from "./rules";
import { SecretsGroup } from "./secrets";
import { SettingsGroup } from "./settings";
import { SubscriptionsGroup } from "./subscriptions";
import { TransactionsGroup } from "./transactions";

/**
 * The mamen HTTP API contract. Pure schema values — feeds the server
 * implementation (@mamen/api), the derived client (@mamen/sdk), and the
 * OpenAPI spec. Prefixed under `/api`; groups are added here as resources
 * are ported.
 */
export class Api extends HttpApi.make("mamen")
	.add(HealthGroup)
	.add(AccountsGroup)
	.add(CategoriesGroup)
	.add(IssuersGroup)
	.add(TransactionsGroup)
	.add(RulesGroup)
	.add(SubscriptionsGroup)
	.add(SettingsGroup)
	.add(SecretsGroup)
	.add(AppSettingsGroup)
	.add(DatabaseGroup)
	.add(ImportGroup)
	.addError(HttpApiError.InternalServerError)
	.prefix("/api")
	.annotateContext(
		OpenApi.annotations({
			title: "Mamen API",
			version: "0.0.0",
			description: "Personal finance API (Effect HttpApi).",
		}),
	) {}
