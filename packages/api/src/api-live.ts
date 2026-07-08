import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Layer } from "effect";
import { HealthLive } from "./health/handlers";

/**
 * The assembled API layer: the contract wired to every group implementation.
 * New group layers are added to the provide list as resources are ported.
 */
export const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(HealthLive));
