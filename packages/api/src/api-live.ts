import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Layer } from "effect";
import { AccountsLive } from "./accounts/handlers";
import { HealthLive } from "./health/handlers";

/**
 * The assembled API layer: the contract wired to every group implementation.
 * New group layers are added to the provide list as resources are ported.
 *
 * This layer still **requires** `SqlClient.SqlClient` — the caller provides the
 * data layer: `DatabaseLive` (Bun, real file) in prod via `ServerLive`, or
 * `DatabaseTest` (`:memory:`, sqlite-node) in tests. Keeping the DB out of here
 * is what lets the integration tests swap the driver.
 */
export const ApiLive = HttpApiBuilder.api(Api).pipe(
	Layer.provide([HealthLive, AccountsLive]),
);
