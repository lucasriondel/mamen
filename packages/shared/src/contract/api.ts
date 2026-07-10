import { HttpApi, HttpApiError, OpenApi } from "@effect/platform";
import { AccountsGroup } from "./accounts";
import { CategoriesGroup } from "./categories";
import { HealthGroup } from "./health";
import { MerchantsGroup } from "./merchants";
import { RulesGroup } from "./rules";
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
	.add(MerchantsGroup)
	.add(TransactionsGroup)
	.add(RulesGroup)
	.addError(HttpApiError.InternalServerError)
	.prefix("/api")
	.annotateContext(
		OpenApi.annotations({
			title: "Mamen API",
			version: "0.0.0",
			description: "Personal finance API (Effect HttpApi).",
		}),
	) {}
