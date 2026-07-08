import { HttpApiBuilder } from "@effect/platform";
import { Api, Health } from "@mamen/shared/contract";
import { Effect } from "effect";

/** Implements the `health` group of the contract. */
export const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
	handlers.handle("check", () => Effect.succeed(new Health({ status: "ok" }))),
);
